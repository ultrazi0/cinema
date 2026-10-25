<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Stream } from "$lib/schema";
	import { Button, Popover, PopoverMenu, RangeInput } from "glow";
	import { formatTime, type AudioTrack, type SubtitleTrack } from "$lib/utils";
	import { createAudioSubtitleMenu, createScrub, createStreamMenu } from "$lib/playerMenus.svelte";
	import PieceMap from "./PieceMap.svelte";

	const SEEK_STEP = 10;

	
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

	const scrub = createScrub({
		duration: () => duration,
		currentTime: () => currentTime,
		buffered: () => buffered,
		
		onSeek: () => onSeek,
	});

	const volumeIcon = $derived(
		muted || volume === 0
			? "VolumeX"
			: volume < 0.5
				? "Volume1"
				: "Volume2",
	);

	function seek(seconds: number) {
		onSeekBy?.(seconds);
		navigator.vibrate?.(15);
	}

	const streamMenu = createStreamMenu({
		streams: () => streams,
		activeStreamHash: () => activeStreamHash,
		transcoding: () => transcoding,
		hasAudioPretranscoding: () => hasAudioPretranscoding,
		hasFullPretranscoding: () => hasFullPretranscoding,
		onStreamSelect: () => onStreamSelect,
		onTranscodingChange: () => onTranscodingChange,
	});

	const audioSubtitleMenu = createAudioSubtitleMenu({
		audioTracks: () => audioTracks,
		activeAudioTrack: () => activeAudioTrack,
		subtitleTracks: () => subtitleTracks,
		subtitlesActive: () => subtitlesActive,
		activeTrackUrl: () => activeTrackUrl,
		subtitleOffsetControl: () => subtitleOffsetControl,
		onAudioSelect: () => onAudioSelect,
		onSubtitleSelect: () => onSubtitleSelect,
		onSubtitleOff: () => onSubtitleOff,
	});
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
		<span class="time">{formatTime(scrub.displayTime)}</span>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="progress-container"
			use:scrub.bindTrack
			onpointerdown={scrub.onPointerDown}
			onpointermove={scrub.onPointerMove}
			onpointerup={scrub.onPointerUp}
			role="slider"
			aria-valuenow={scrub.displayTime}
			aria-valuemin={0}
			aria-valuemax={duration}
			tabindex="-1"
		>
			<div class="progress-track">
				{#if pieceMap.length > 0 && streamStats && !streamStats.finished}
					<PieceMap {pieceMap} />
				{/if}
				<div class="progress-buffered" style="width: {scrub.bufferedPercent}%"></div>
				<div class="progress-fill" style="width: {scrub.progressPercent}%"></div>
				<div class="progress-thumb" style="left: {scrub.progressPercent}%"></div>
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
			<PopoverMenu items={streamMenu.items} align="right">
				{#snippet trigger()}
					<Button variant="ghost" size="lg" icon="Settings2" />
				{/snippet}
			</PopoverMenu>
		{/if}

		{#if audioTracks.length > 1 || subtitleTracks.length > 0}
			<PopoverMenu items={audioSubtitleMenu.items} align="right">
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
