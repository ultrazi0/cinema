<script lang="ts">
	import type { Stream, TorrentFileEntry } from "$lib/schema";
	import { api } from "$lib/api";
	import {
		Button,
		CheckboxInput,
		Modal,
		Spinner,
		Text,
		toast,
		tooltip,
	} from "glow";
	import {
		canEnqueueDownload,
		DOWNLOAD_STATUS_LABEL,
		formatBytes,
	} from "$lib/utils";

	let {
		open = $bindable(false),
		tmdbId,
		season,
		episodeCount,
	}: {
		open: boolean;
		tmdbId: number;
		season: number | null;
		episodeCount: number;
	} = $props();

	type Step = "candidates" | "files";

	let step = $state<Step>("candidates");
	let loadingCandidates = $state(false);
	let candidates = $state<Stream[]>([]);
	let selected = $state<Stream | null>(null);
	let loadingFiles = $state(false);
	let files = $state<TorrentFileEntry[]>([]);
	let checked = $state<Set<number>>(new Set());
	let enqueueing = $state(false);

	const RESOLUTION_ORDER: Record<string, number> = {
		"4K": 4,
		"2160p": 4,
		"1080p": 3,
		"720p": 2,
		"480p": 1,
	};

	const resolutions = $derived.by(() => {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const s of candidates) {
			const res = s.resolution ?? "Unknown";
			if (!seen.has(res)) {
				seen.add(res);
				result.push(res);
			}
		}
		return result.sort(
			(a, b) => (RESOLUTION_ORDER[b] ?? 0) - (RESOLUTION_ORDER[a] ?? 0),
		);
	});

	function candidatesForResolution(res: string) {
		return candidates.filter((s) => (s.resolution ?? "Unknown") === res);
	}

	function reset() {
		step = "candidates";
		candidates = [];
		selected = null;
		files = [];
		checked = new Set();
		loadingCandidates = false;
		loadingFiles = false;
		enqueueing = false;
	}

	$effect(() => {
		if (!open || season == null) {
			reset();
			return;
		}
		loadingCandidates = true;
		let ignore = false;
		api.streams
			.tvSeason(tmdbId, season)
			.then((result) => {
				if (!ignore) candidates = result;
			})
			.catch((err) => {
				if (!ignore) {
					toast.error(`Failed to load season packs: ${err.message}`);
					open = false;
				}
			})
			.finally(() => {
				if (!ignore) loadingCandidates = false;
			});
		return () => {
			ignore = true;
		};
	});

	async function pickCandidate(stream: Stream) {
		selected = stream;
		step = "files";
		loadingFiles = true;
		files = [];
		checked = new Set();
		try {
			const result = await api.streams.torrentFiles(stream.info_hash);
			files = result.toSorted((a, b) => a.name.localeCompare(b.name));
			// Pre-select every file that isn't already downloaded.
			selectAll();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to load files: ${msg}`);
			step = "candidates";
			selected = null;
		} finally {
			loadingFiles = false;
		}
	}

	function toggleFile(fileIdx: number, isChecked: boolean) {
		const next = new Set(checked);
		if (isChecked) next.add(fileIdx);
		else next.delete(fileIdx);
		checked = next;
	}

	function selectAll() {
		checked = new Set(
			files
				.filter((f) => canEnqueueDownload(f.download_status))
				.map((f) => f.file_idx),
		);
	}

	function selectNone() {
		checked = new Set();
	}

	function goBack() {
		step = "candidates";
		selected = null;
		files = [];
		checked = new Set();
	}

	async function enqueueSelected() {
		if (!selected || checked.size === 0 || enqueueing) return;
		enqueueing = true;
		const info_hash = selected.info_hash;
		try {
			const enqueued = await api.downloads.enqueueBulk({
				items: [...checked].map((file_idx) => ({
					info_hash,
					file_idx,
				})),
			});
			if (enqueued.length === checked.size) {
				toast.success(`Enqueued ${enqueued.length} downloads`);
			} else {
				toast.warning(
					`Enqueued ${enqueued.length} downloads, but ${checked.size - enqueued.length} failed`,
				);
			}
			open = false;
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			toast.error(`Bulk enqueue failed: ${msg}`);
		} finally {
			enqueueing = false;
		}
	}
</script>

<Modal bind:open title="Download season" size="large">
	<div class="season-modal">
		{#if step === "candidates"}
			{#if loadingCandidates}
				<div class="loading">
					<Spinner />
					<Text variant="muted" size="sm">Finding season packs…</Text>
				</div>
			{:else if candidates.length === 0}
				<div class="empty">
					<Text variant="muted" size="sm">No season packs found</Text>
				</div>
			{:else}
				<div class="groups">
					{#each resolutions as res}
						<div class="resolution-group">
							<div class="res-header">
								<Text size="xs" weight="semibold" variant="secondary"
									>{res}</Text
								>
							</div>
							<div class="candidate-list">
								{#each candidatesForResolution(res) as stream}
									<button
										class="candidate-row"
										onclick={() => pickCandidate(stream)}
									>
										<div class="candidate-main">
											<Text size="sm" weight="semibold">{stream.source}</Text>
											<div class="chips">
												{#if stream.codec}
													<span class="chip">{stream.codec}</span>
												{/if}
												{#if stream.audio}
													<span class="chip">{stream.audio}</span>
												{/if}
												{#if stream.source_type}
													<span class="chip">{stream.source_type}</span>
												{/if}
												{#if stream.hdr}
													<span class="chip chip--hdr">HDR</span>
												{/if}
											</div>
										</div>
										<div class="candidate-meta">
											{#if stream.size_bytes != null && episodeCount > 0}
												<Text size="xs" variant="muted">
													<span
														use:tooltip={{
															content: `Based on ${episodeCount} episodes with the size of the first being ${formatBytes(stream.size_bytes)}`,
															position: "bottom",
														}}
													>
														~{formatBytes(stream.size_bytes * episodeCount)}
													</span>
												</Text>
											{:else if stream.size_bytes !== null}
												<Text size="xs" variant="muted">
													{formatBytes(stream.size_bytes)}
												</Text>
											{:else if stream.size_display}
												<Text size="xs" variant="muted">
													{stream.size_display}
												</Text>
											{/if}
											{#if stream.seeders != null}
												<Text size="xs" variant="muted">
													{stream.seeders} seeds
												</Text>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="files-header">
				<Button variant="ghost" icon="ArrowLeft" onclick={goBack}>Back</Button>
				<div class="files-header-actions">
					<Button variant="ghost" onclick={selectAll}>Select all</Button>
					<Button variant="ghost" onclick={selectNone}>Select none</Button>
				</div>
			</div>
			{#if loadingFiles}
				<div class="loading">
					<Spinner />
					<Text variant="muted" size="sm">Loading file list…</Text>
				</div>
			{:else if files.length === 0}
				<div class="empty">
					<Text variant="muted" size="sm">No files in this torrent</Text>
				</div>
			{:else}
				<div class="file-list">
					{#each files as file}
						<label
							class="file-row"
							class:disabled={!canEnqueueDownload(file.download_status)}
						>
							<CheckboxInput
								checked={checked.has(file.file_idx)}
								disabled={!canEnqueueDownload(file.download_status)}
								onChange={(v) => toggleFile(file.file_idx, v)}
							/>
							<div class="file-main">
								<Text size="sm">{file.full_path || file.name}</Text>
								<Text size="xs" variant="muted">
									{formatBytes(file.size_bytes)}
									{#if file.download_status}
										· {DOWNLOAD_STATUS_LABEL[file.download_status]}
									{/if}
								</Text>
							</div>
						</label>
					{/each}
				</div>
				<div class="footer">
					<Button
						variant="primary"
						loading={enqueueing}
						disabled={checked.size === 0}
						onclick={enqueueSelected}
					>
						Enqueue {checked.size}
						{checked.size === 1 ? "file" : "files"}
						{#if checked.size > 0}
							{@const size = files
								.filter((file) => checked.has(file.file_idx))
								.map((file) => file.size_bytes)
								.reduce((sum, val) => val + sum, 0)} ({formatBytes(size)})
						{/if}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</Modal>

<style lang="scss">
	@use "glow/styles/theme" as *;

	.season-modal {
		min-height: 8rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.loading,
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
	}

	.candidate-list,
	.file-list {
		display: flex;
		flex-direction: column;
	}

	.groups {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.resolution-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.res-header {
		padding: 0 0.25rem 0.25rem;
		border-bottom: $border;
	}

	.candidate-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 0.5rem;
		border-radius: 8px;
		background: transparent;
		border: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s;

		&:hover {
			background: rgba(255, 255, 255, 0.05);
		}
	}

	.candidate-main {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.chip {
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		white-space: nowrap;
	}

	.chip--hdr {
		background: rgba(251, 191, 36, 0.2);
		color: rgb(251, 191, 36);
	}

	.candidate-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.files-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.files-header-actions {
		display: flex;
		gap: 0.25rem;
	}

	.file-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.15s;

		&:hover {
			background: rgba(255, 255, 255, 0.04);
		}

		&.disabled {
			opacity: 0.5;
			cursor: default;
		}
	}

	.file-main {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.footer {
		display: flex;
		justify-content: flex-end;
		padding-top: 0.5rem;
		border-top: $border;
	}
</style>
