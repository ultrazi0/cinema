import type { Snippet } from "svelte";
import type { PopoverMenuEntry } from "glow";
import type { Stream } from "$lib/schema";
import {
	DOWNLOAD_STATUS_LABEL,
	sortResolutions,
	type AudioTrack,
	type SubtitleTrack,
} from "$lib/utils";

// All options are getters so the derived values stay reactive to prop changes.
export interface StreamMenuOptions {
	streams: () => Stream[];
	activeStreamHash: () => string | undefined;
	transcoding: () => { enabled: boolean; onlyAudio: boolean };
	hasAudioPretranscoding: () => boolean;
	hasFullPretranscoding: () => boolean;
	onStreamSelect: () => ((stream: Stream) => void) | undefined;
	onTranscodingChange: () => ((enabled: boolean, onlyAudio: boolean) => void) | undefined;
}

export function createStreamMenu(opts: StreamMenuOptions) {
	const activeResolution = $derived(
		opts.streams().find((s) => s.info_hash === opts.activeStreamHash())?.resolution ??
		null,
	);

	const resolutions = $derived(sortResolutions(opts.streams()));

	const transcodeOptions = $derived([
		{ value: "none", label: "None", icon: "Ban" as const },
		{
			value: "audio",
			label: "Audio",
			icon: opts.hasAudioPretranscoding()
				? { name: "AudioLines" as const, color: "var(--glow-color-success)" }
				: ("AudioLines" as const),
		},
		{
			value: "both",
			label: "Audio + video",
			icon: opts.hasFullPretranscoding()
				? { name: "Film" as const, color: "var(--glow-color-success)" }
				: ("Film" as const),
		},
	]);

	const transcodingMode = $derived(
		!opts.transcoding().enabled
			? "none"
			: opts.transcoding().onlyAudio
				? "audio"
				: "both",
	);

	// Mutates the `transcoding` prop object in place (as the components did before).
	function setTranscodingMode(mode: string) {
		const enabled = mode !== "none";
		const onlyAudio = mode === "audio";
		const transcoding = opts.transcoding();
		transcoding.enabled = enabled;
		transcoding.onlyAudio = onlyAudio;
		opts.onTranscodingChange()?.(enabled, onlyAudio);
	}

	const items = $derived<PopoverMenuEntry[]>([
		...(resolutions.length > 1
			? [
				{ kind: "header" as const, label: "Quality" },
				...resolutions.map((res) => ({
					kind: "item" as const,
					label: res,
					selected: res === activeResolution,
					onclick: () => {
						const best = opts.streams().find((s) => s.resolution === res);
						if (best) opts.onStreamSelect()?.(best);
					},
				})),
			]
			: []),
		{ kind: "header" as const, label: "Sources" },
		...(activeResolution
			? opts.streams().filter((s) => s.resolution === activeResolution)
			: opts.streams()
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
				selected: stream.info_hash === opts.activeStreamHash(),
				onclick: () => opts.onStreamSelect()?.(stream),
			})),
		...(opts.onTranscodingChange()
			? [
				{ kind: "header" as const, label: "Transcoding" },
				{
					kind: "radio" as const,
					options: transcodeOptions,
					value: transcodingMode,
					iconOnly: true,
					onChange: setTranscodingMode,
				},
			]
			: []),
	]);

	return {
		get items() {
			return items;
		},
	};
}

export interface AudioSubtitleMenuOptions {
	audioTracks: () => AudioTrack[];
	activeAudioTrack: () => number;
	subtitleTracks: () => SubtitleTrack[];
	subtitlesActive: () => boolean;
	activeTrackUrl: () => string | undefined;
	subtitleOffsetControl: () => Snippet | undefined;
	onAudioSelect: () => ((track: AudioTrack) => void) | undefined;
	onSubtitleSelect: () => ((track: SubtitleTrack) => void) | undefined;
	onSubtitleOff: () => (() => void) | undefined;
}

export function createAudioSubtitleMenu(opts: AudioSubtitleMenuOptions) {
	const items = $derived<PopoverMenuEntry[]>([
		...(opts.audioTracks().length > 1
			? [
				{ kind: "header" as const, label: "Audio" },
				...opts.audioTracks().map((track) => ({
					kind: "item" as const,
					label: track.name,
					description: track.lang ?? undefined,
					selected: track.id === opts.activeAudioTrack(),
					onclick: () => opts.onAudioSelect()?.(track),
				})),
				"divider" as const,
			]
			: []),
		...(opts.subtitleTracks().length > 0
			? [
				{ kind: "header" as const, label: "Subtitles" },
				{
					kind: "item" as const,
					label: "Off",
					selected: !opts.subtitlesActive(),
					onclick: () => opts.onSubtitleOff()?.(),
				},
				...opts.subtitleTracks().map((track) => {
					const isEmbedded = track.id.startsWith("embedded:");
					const dupes = opts
						.subtitleTracks()
						.filter(
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
						selected: track.url === opts.activeTrackUrl(),
						onclick: () => opts.onSubtitleSelect()?.(track),
					};
				}),
				...(opts.subtitlesActive() && opts.subtitleOffsetControl()
					? [
						"divider" as const,
						{
							kind: "custom" as const,
							render: opts.subtitleOffsetControl()!,
						},
					]
					: []),
			]
			: []),
	]);

	return {
		get items() {
			return items;
		},
	};
}

export interface ScrubOptions {
	duration: () => number;
	currentTime: () => number;
	buffered: () => number;
	onScrub?: () => ((time: number) => void) | undefined;
	onSeek: () => ((time: number) => void) | undefined;
}

/** Progress-bar scrubbing state and pointer handlers shared by the player and remote. */
export function createScrub(opts: ScrubOptions) {
	let trackEl = $state<HTMLDivElement | undefined>(undefined);
	let scrubbing = $state(false);
	let scrubValue = $state(0);

	const displayTime = $derived(scrubbing ? scrubValue : opts.currentTime());
	const progressPercent = $derived(
		opts.duration() > 0 ? (displayTime / opts.duration()) * 100 : 0,
	);
	const bufferedPercent = $derived(
		opts.duration() > 0 ? (opts.buffered() / opts.duration()) * 100 : 0,
	);

	function posFromEvent(clientX: number): number | null {
		const duration = opts.duration();
		if (!trackEl || !duration) return null;
		const rect = trackEl.getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return pct * duration;
	}

	return {
		get scrubbing() {
			return scrubbing;
		},
		get displayTime() {
			return displayTime;
		},
		get progressPercent() {
			return progressPercent;
		},
		get bufferedPercent() {
			return bufferedPercent;
		},
		/** Svelte action: `use:scrub.bindTrack` on the track element. */
		bindTrack(node: HTMLDivElement) {
			trackEl = node;
			return {
				destroy() {
					if (trackEl === node) trackEl = undefined;
				},
			};
		},
		posFromEvent,
		onPointerDown(e: PointerEvent & { currentTarget: HTMLDivElement }) {
			const t = posFromEvent(e.clientX);
			if (t == null) return;
			scrubbing = true;
			scrubValue = t;
			opts.onScrub?.()?.(t);
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		/** Returns the time under the pointer (or null) so callers can add hover logic. */
		onPointerMove(e: PointerEvent): number | null {
			const t = posFromEvent(e.clientX);
			if (t == null) return null;
			if (scrubbing) {
				scrubValue = t;
				opts.onScrub?.()?.(t);
			}
			return t;
		},
		onPointerUp(e: PointerEvent) {
			if (!scrubbing) return;
			const t = posFromEvent(e.clientX) ?? scrubValue;
			scrubbing = false;
			opts.onSeek()?.(t);
		},
	};
}
