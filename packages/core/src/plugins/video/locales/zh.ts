import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: '插入视频',
	insertVideoTooltip: '插入视频',

	urlLabel: '视频网址',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: '视频网址',
	titleLabel: '标题',
	titlePlaceholder: '描述该视频',
	titleAria: '视频标题',
	titleHint: '为屏幕阅读器描述该视频。必填。',
	captionLabel: '说明文字',
	captionPlaceholder: '可选的可见说明文字',
	captionAria: '视频说明文字',
	aspectRatioLabel: '宽高比',
	aspectRatioAria: '视频宽高比',

	insertButton: '插入',
	insertAria: '插入视频',
	updateButton: '更新',
	updateAria: '更新视频',
	cancelButton: '取消',
	insertDialogLabel: '插入视频',
	editDialogLabel: '编辑视频',

	invalidUrl: '请输入 YouTube、Vimeo 或 Dailymotion 的视频网址。',
	titleRequired: '请输入标题，以便屏幕阅读器描述该视频。',

	play: (title: string) => (title ? `播放视频：${title}` : '播放视频'),
	loading: '正在加载视频...',
	providerBadge: (provider: string) => `${provider} 视频`,
	closePlayer: '关闭视频播放器',

	videoAria: (provider: string, title: string) =>
		title ? `${provider} 视频：${title}` : `${provider} 视频`,

	videoSelected: '已选择视频。',
	videoSelectedWithTitle: (title: string) => `已选择视频：${title}。`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} 调整大小。`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} 调整大小`,
	videoResized: (percent: number) => `视频宽度已调整为 ${percent}%。`,
	resetToDefaultSize: '视频已重置为全宽。',

	enteredPlayer: (title: string) =>
		title ? `正在播放 ${title}。按 Escape 返回文档。` : '正在播放视频。按 Escape 返回文档。',
	exitedPlayer: '已返回文档。',

	videoOptions: '视频选项',
	editVideo: '编辑视频',
	alignStart: '左对齐',
	alignCenter: '居中',
	alignEnd: '右对齐',
	deleteVideo: '删除视频',

	embedPrompt: '嵌入此视频？',
	embedConfirm: '嵌入',
	embedDismiss: '保留为链接',
	embedOfferAnnounce: (provider: string) =>
		`已粘贴 ${provider} 链接。选择“嵌入”可将其转换为视频，或继续编辑以保留为链接。`,
	embeddedAnnounce: '视频已嵌入。',
};

export default locale;
