<script lang="ts">
	let { pieceMap }: { pieceMap: number[] } = $props();
</script>

<div class="progress-pieces">
	{#each pieceMap as value}
		<div class="piece" style="opacity: {value / 255}"></div>
	{/each}
</div>

<style>
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

	.piece {
		flex: 1;
		background: rgba(255, 255, 255, 0.25);
		transition: opacity 2s ease;
	}
</style>
