/**
 * 统一入口：ZIP / 本地文件夹 → 原始字节或遍历；聚合解码见 `core/pipeline.mjs`
 */
export { walkZipBuffer } from './zipArchive.mjs'
/**
 * 遍历本地文件夹
 */
export { walkFolderHandle, enumerateTextFileHandles } from './localFolder.mjs'
/**
 * 枚举文本文件句柄
 */
export { finalizeRawEntries } from '../core/pipeline.mjs'
