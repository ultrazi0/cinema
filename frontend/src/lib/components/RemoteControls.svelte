<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Stream } from "$lib/schema";
	import { Button, Popover, PopoverMenu, RangeInput, type PopoverMenuEntry } from "glow";
	import { DOWNLOAD_STATUS_LABEL } from "$lib/utils";

	const SEEK_STEP = 10;

	interface AudioTrack {
		id: number;
		name: string;
		lang?: string;
	}
	interface SubtitleTrack {
		id: string;
		language: string;
		url: string;
	}

	let {
		paused = true,
		loading = false,
		currentTime = 0,
		duration = 0,
		buffered = 0,
		volume = 1,
		muted = false,
		pieceMap = [],
		streamStats = null,
		streams = [],
		activeStreamHash,
		audioTracks = [],
		activeAudioTrack = 0,
		subtitleTracks = [],
		subtitlesActive = false,
		activeTrackUrl,
		transcoding = { enabled: false, onlyAudio: false },
		hasAudioPretranscoding = false,
		hasFullPretranscoding = false,
		subtitleOffsetControl,
		onTogglePlay,
		onSeekBy,
		onSeek,
		onSetVolume,
		onToggleFullscreen,
		onStreamSelect,
		onAudioSelect,
		onSubtitleSelect,
		onSubtitleOff,
		onTranscodingChange,
	}: {
		paused?: boolean;
		loading?: boolean;
		currentTime?: number;
		duration?: number;
		buffered?: number;
		volume?: number;
		muted?: boolean;
		pieceMap?: number[];
		streamStats?: { finished: boolean } | null;
		streams?: Stream[];
		activeStreamHash?: string;
		audioTracks?: AudioTrack[];
		activeAudioTrack?: number;
		subtitleTracks?: SubtitleTrack[];
		subtitlesActive?: boolean;
		activeTrackUrl?: string;
		transcoding?: { enabled: boolean; onlyAudio: boolean };
		hasAudioPretranscoding?: boolean;
		hasFullPretranscoding?: boolean;
		subtitleOffsetControl?: Snippet;
		onTogglePlay?: () => void;
		onSeekBy?: (seconds: number) => void;
		onSeek?: (seconds: number) => void;
		onSetVolume?: (volume: number) => void;
		onToggleFullscreen?: () => void;
		onStreamSelect?: (stream: Stream) => void;
		onAudioSelect?: (track: AudioTrack) => void;
		onSubtitleSelect?: (track: SubtitleTrack) => void;
		onSubtitleOff?: () => void;
		onTranscodingChange?: (enabled: boolean, onlyAudio: boolean) => void;
	} = $props();

	let trackEl = $state<HTMLDivElement | undefined>(undefined);
	let scrubbing = $state(false);
	let scrubValue = $state(0);

	const displayTime = $derived(scrubbing ? scrubValue : currentTime);
	const progressPercent = $derived(
		duration > 0 ? (displayTime / duration) * 100 : 0,
	);
	const bufferedPercent = $derived(
		duration > 0 ? (buffered / duration) * 100 : 0,
	);

	const volumeIcon = $derived(
		muted || volume === 0
			? "VolumeX"
			: volume < 0.5
				? "Volume1"
				: "Volume2",
	);

	function formatTime(seconds: number): string {
		if (!isFinite(seconds) || seconds < 0) return "0:00";
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		if (h > 0)
			return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
		return `${m}:${s.toString().padStart(2, "0")}`;
	}

	function posFromEvent(clientX: number): number | null {
		if (!trackEl || !duration) return null;
		const rect = trackEl.getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return pct * duration;
	}

	function onPointerDown(e: PointerEvent & { currentTarget: HTMLDivElement }) {
		const t = posFromEvent(e.clientX);
		if (t == null) return;
		scrubbing = true;
		scrubValue = t;
		e.currentTarget.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!scrubbing) return;
		const t = posFromEvent(e.clientX);
		if (t == null) return;
		scrubValue = t;
	}

	function onPointerUp(e: PointerEvent) {
		if (!scrubbing) return;
		const t = posFromEvent(e.clientX) ?? scrubValue;
		scrubbing = false;
		onSeek?.(t);
	}

	function seek(seconds: number) {
		onSeekBy?.(seconds);
		navigator.vibrate?.(15);
	}

	const activeResolution = $derived(
		streams.find((s) => s.info_hash === activeStreamHash)?.resolution ?? null,
	);

	const resolutions = $derived.by(() => {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const s of streams) {
			const res = s.resolution;
			if (res && !seen.has(res)) {
				seen.add(res);
				result.push(res);
			}
		}
		const order: Record<string, number> = {
			"4K": 4,
			"2160p": 4,
			"1080p": 3,
			"720p": 2,
			"480p": 1,
		};
		return result.sort((a, b) => (order[b] ?? 0) - (order[a] ?? 0));
	});

	const TRANSCODE_OPTIONS = $derived([
		{ value: "none", label: "None", icon: "Ban" as const },
		{
			value: "audio",
			label: "Audio",
			icon: hasAudioPretranscoding
				? { name: "AudioLines" as const, color: "var(--glow-color-success)" }
				: ("AudioLines" as const),
		},
		{
			value: "both",
			label: "Audio + video",
			icon: hasFullPretranscoding
				? { name: "Film" as const, color: "var(--glow-color-success)" }
				: ("Film" as const),
		},
	]);

	const transcodingMode = $derived(
		!transcoding.enabled ? "none" : transcoding.onlyAudio ? "audio" : "both",
	);

	function setTranscodingMode(mode: string) {
		const enabled = mode !== "none";
		const onlyAudio = mode === "audio";
		transcoding.enabled = enabled;
		transcoding.onlyAudio = onlyAudio;
		onTranscodingChange?.(enabled, onlyAudio);
	}

	const streamMenuItems = $derived<PopoverMenuEntry[]>([
		...(resolutions.length > 1
			? [
					{ kind: "header" as const, label: "Quality" },
					...resolutions.map((res) => ({
						kind: "item" as const,
						label: res,
						selected: res === activeResolution,
						onclick: () => {
							const best = streams.find((s) => s.resolution === res);
							if (best) onStreamSelect?.(best);
						},
					})),
				]
			: []),
		{ kind: "header" as const, label: "Sources" },
		...(activeResolution
			? streams.filter((s) => s.resolution === activeResolution)
			: streams
		)
			.slice(0, 8)
			.map((stream) => ({
				kind: "item" as const,
				label: `${stream.source}`,
				description: [
					stream.codec,
					stream.audio,
					stream.source_type,
					stream.download
						? (DOWNLOAD_STATUS_LABEL[stream.download.status] ??
							stream.download.status)
						: null,
				]
					.filter(Boolean)
					.join(" · "),
				shortcut: stream.size_display ?? undefined,
				selected: stream.info_hash === activeStreamHash,
				onclick: () => onStreamSelect?.(stream),
			})),
		...(onTranscodingChange
			? [
					{ kind: "header" as const, label: "Transcoding" },
					{
						kind: "radio" as const,
						options: TRANSCODE_OPTIONS,
						value: transcodingMode,
						iconOnly: true,
						onChange: setTranscodingMode,
					},
				]
			: []),
	]);

	const audioSubtitleMenuItems = $derived<PopoverMenuEntry[]>([
		...(audioTracks.length > 1
			? [
					{ kind: "header" as const, label: "Audio" },
					...audioTracks.map((track) => ({
						kind: "item" as const,
						label: track.name,
						description: track.lang ?? undefined,
						selected: track.id === activeAudioTrack,
						onclick: () => onAudioSelect?.(track),
					})),
					"divider" as const,
				]
			: []),
		...(subtitleTracks.length > 0
			? [
					{ kind: "header" as const, label: "Subtitles" },
					{
						kind: "item" as const,
						label: "Off",
						selected: !subtitlesActive,
						onclick: () => onSubtitleOff?.(),
					},
					...subtitleTracks.map((track) => {
						const isEmbedded = track.id.startsWith("embedded:");
						const dupes = subtitleTracks.filter(
							(t) =>
								t.language === track.language &&
								t.id.startsWith("embedded:") === isEmbedded,
						);
						const suffix =
							dupes.length > 1 ? ` #${dupes.indexOf(track) + 1}` : "";
						return {
							kind: "item" as const,
							label: `${track.language}${suffix}`,
							description: isEmbedded ? "Embedded" : undefined,
							selected: track.url === activeTrackUrl,
							onclick: () => onSubtitleSelect?.(track),
						};
					}),
					...(subtitlesActive && subtitleOffsetControl
						? [
								"divider" as const,
								{
									kind: "custom" as const,
									render: subtitleOffsetControl,
								},
							]
						: []),
				]
			: []),
	]);
</script>

<div class="remote-controls">
	<div class="pad">
		<div class="pill">
			<Button
				variant="ghost"
				shape="circle"
				size="lg"
				icon="Rewind"
				onclick={() => seek(-SEEK_STEP)}
			/>
			<Button
				class="play"
				variant="primary"
				shape="circle"
				size="lg"
				icon={paused ? "Play" : "Pause"}
				{loading}
				onclick={onTogglePlay}
			/>
			<Button
				variant="ghost"
				shape="circle"
				size="lg"
				icon="FastForward"
				onclick={() => seek(SEEK_STEP)}
			/>
		</div>
	</div>

	<div class="progress">
		<span class="time">{formatTime(displayTime)}</span>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="progress-container"
			bind:this={trackEl}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			role="slider"
			aria-valuenow={displayTime}
			aria-valuemin={0}
			aria-valuemax={duration}
			tabindex="-1"
		>
			<div class="progress-track">
				{#if pieceMap.length > 0 && streamStats && !streamStats.finished}
					<div class="progress-pieces">
						{#each pieceMap as value}
							<div class="piece" style="opacity: {value / 255}"></div>
						{/each}
					</div>
				{/if}
				<div class="progress-buffered" style="width: {bufferedPercent}%"></div>
				<div class="progress-fill" style="width: {progressPercent}%"></div>
				<div class="progress-thumb" style="left: {progressPercent}%"></div>
			</div>
		</div>
		<span class="time">{formatTime(duration)}</span>
	</div>

	<div class="bottom">
		<Popover align="stretch" sheet={false}>
			{#snippet trigger()}
				<Button variant="ghost" size="lg" icon={volumeIcon} />
			{/snippet}
			{#snippet children()}
				<RangeInput
						min={0}
						max={1}
						step={0.01}
						value={muted ? 0 : volume}
						showValue={false}
						thumb="always"
						onChange={onSetVolume}
				/>
			{/snippet}
		</Popover>

		{#if streams.length > 0 && onStreamSelect}
			<PopoverMenu items={streamMenuItems} align="right">
				{#snippet trigger()}
					<Button variant="ghost" size="lg" icon="Settings2" />
				{/snippet}
			</PopoverMenu>
		{/if}

		{#if audioTracks.length > 1 || subtitleTracks.length > 0}
			<PopoverMenu items={audioSubtitleMenuItems} align="right">
				{#snippet trigger()}
					<Button variant="ghost" size="lg" icon="ClosedCaption" />
				{/snippet}
			</PopoverMenu>
		{/if}

		{#if onToggleFullscreen}
			<Button
				variant="ghost"
				icon="Maximize"
				onclick={onToggleFullscreen}
				tooltip="Fullscreen"
			/>
		{/if}
	</div>
</div>

<style lang="scss">
	.remote-controls {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.pad {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.pill {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.6rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(16px);
	}

	.pad :global(.play) {
		width: 5.5rem;
		height: 5.5rem;
	}

	.progress {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.25rem 0.75rem;
		flex-shrink: 0;
	}

	.time {
		font-family: "JetBrains Mono", monospace;
		font-size: 0.75rem;
		font-weight: 400;
		letter-spacing: 0.02em;
		white-space: nowrap;
		opacity: 0.75;
		min-width: 3.25em;
	}

	.time:last-child {
		text-align: right;
	}

	.progress-container {
		position: relative;
		flex: 1;
		height: 28px;
		display: flex;
		align-items: center;
		cursor: pointer;
		touch-action: manipulation;
		outline: none;
	}

	.progress-track {
		position: relative;
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
	}

	.progress-pieces {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-pieces .piece {
		flex: 1;
		background: rgba(255, 255, 255, 0.25);
		transition: opacity 2s ease;
	}

	.progress-buffered {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		transition: width 0.1s linear;
	}

	.progress-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: #e4e4e7;
		border-radius: 2px;
		transition: width 0.05s linear;
	}

	.progress-thumb {
		position: absolute;
		top: 50%;
		width: 14px;
		height: 14px;
		background: #e4e4e7;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
		pointer-events: none;
		z-index: 3;
	}

	.bottom {
		display: flex;
		align-items: center;
		justify-content: space-evenly;
		padding: 0.25rem 0.5rem max(0.5rem, env(safe-area-inset-bottom));
		flex-shrink: 0;
	}

	.bottom :global(button) {
		min-width: 44px;
		min-height: 44px;
	}
</style>
