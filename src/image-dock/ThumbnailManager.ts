import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// sharpが利用できない場合のフォールバック処理を含む
let sharp: any;
try {
    sharp = require('sharp');
} catch (error) {
    console.warn('Sharp module not available, thumbnails will be disabled');
}

export class ThumbnailManager {
    private cacheDir: string;
    private thumbnailSize: number;

    constructor(private context: vscode.ExtensionContext) {
        this.cacheDir = path.join(context.globalStorageUri.fsPath, 'media', 'cache');
        this.ensureCacheDir();

        const config = vscode.workspace.getConfiguration('ximgdock');
        this.thumbnailSize = config.get<number>('thumbnailSize', 128);
    }

    private ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    public async getThumbnail(imageUri: vscode.Uri): Promise<vscode.Uri> {
        if (!sharp) {
            // sharpが利用できない場合はデフォルトアイコンを返す
            return this.getDefaultIcon();
        }

        const imageHash = this.generateHash(imageUri.fsPath);
        const thumbnailPath = path.join(this.cacheDir, `${imageHash}.png`);
        const thumbnailUri = vscode.Uri.file(thumbnailPath);

        // キャッシュが存在するかチェック
        if (fs.existsSync(thumbnailPath)) {
            return thumbnailUri;
        }

        try {
            await this.generateThumbnail(imageUri.fsPath, thumbnailPath);
            return thumbnailUri;
        } catch (error) {
            console.error('Thumbnail generation failed:', error);
            return this.getDefaultIcon();
        }
    }

    private getDefaultIcon(): vscode.Uri {
        // デフォルトのThemeIconの代わりに、小さな透明PNGを生成
        const canvas = this.createDefaultThumbnailBuffer();
        const base64 = canvas.toString('base64');
        return vscode.Uri.parse(`data:image/png;base64,${base64}`);
    }

    private createDefaultThumbnailBuffer(): Buffer {
        // 最小限の透明PNG（1x1ピクセル）
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const ihdr = Buffer.from([
            0x00, 0x00, 0x00, 0x0D, // Length
            0x49, 0x48, 0x44, 0x52, // Type: IHDR
            0x00, 0x00, 0x00, 0x01, // Width: 1
            0x00, 0x00, 0x00, 0x01, // Height: 1
            0x08, 0x06, 0x00, 0x00, 0x00, // Bit depth, Color type, Compression, Filter, Interlace
            0x1F, 0x15, 0xC4, 0x89  // CRC
        ]);
        const idat = Buffer.from([
            0x00, 0x00, 0x00, 0x0B, // Length
            0x49, 0x44, 0x41, 0x54, // Type: IDAT
            0x78, 0x9C, 0x63, 0xF8, 0x0F, 0x00, 0x00, 0x01, 0x00, 0x01,
            0x5C, 0x6A, 0xE4, 0x8B  // CRC
        ]);
        const iend = Buffer.from([
            0x00, 0x00, 0x00, 0x00, // Length
            0x49, 0x45, 0x4E, 0x44, // Type: IEND
            0xAE, 0x42, 0x60, 0x82  // CRC
        ]);

        return Buffer.concat([pngSignature, ihdr, idat, iend]);
    }

    private generateHash(filePath: string): string {
        const stats = fs.statSync(filePath);
        const data = `${filePath}:${stats.mtime.getTime()}:${stats.size}:${this.thumbnailSize}`;
        return crypto.createHash('md5').update(data).digest('hex');
    }

    private async generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
        if (!sharp) {
            throw new Error('Sharp module not available');
        }

        const fileExtension = path.extname(inputPath).toLowerCase();

        try {
            if (fileExtension === '.svg') {
                // SVGの場合は特別な処理が必要
                await this.generateSVGThumbnail(inputPath, outputPath);
            } else {
                // 一般的な画像ファイル
                await sharp(inputPath)
                    .resize(this.thumbnailSize, this.thumbnailSize, {
                        fit: 'inside',
                        withoutEnlargement: true,
                        background: { r: 255, g: 255, b: 255, alpha: 0 }
                    })
                    .png()
                    .toFile(outputPath);
            }
        } catch (error) {
            console.error(`Failed to generate thumbnail for ${inputPath}:`, error);
            // エラーが発生した場合はデフォルトのサムネイルを作成
            await this.createDefaultThumbnail(outputPath);
        }
    }

    private async generateSVGThumbnail(inputPath: string, outputPath: string): Promise<void> {
        try {
            // SVGファイルをPNGに変換
            const svgBuffer = fs.readFileSync(inputPath);
            await sharp(svgBuffer, { density: 150 })
                .resize(this.thumbnailSize, this.thumbnailSize, {
                    fit: 'inside',
                    withoutEnlargement: true,
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                })
                .png()
                .toFile(outputPath);
        } catch (error) {
            console.error(`Failed to process SVG ${inputPath}:`, error);
            // SVG処理に失敗した場合、デフォルトのサムネイルを作成
            await this.createDefaultThumbnail(outputPath);
        }
    }

    private async createDefaultThumbnail(outputPath: string): Promise<void> {
        if (!sharp) {
            return;
        }

        try {
            // 単色の四角形を作成してデフォルトサムネイルとする
            await sharp({
                create: {
                    width: this.thumbnailSize,
                    height: this.thumbnailSize,
                    channels: 4,
                    background: { r: 100, g: 100, b: 100, alpha: 1 }
                }
            })
                .png()
                .toFile(outputPath);
        } catch (error) {
            console.error('Failed to create default thumbnail:', error);
        }
    }

    public clearCache(): void {
        try {
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                files.forEach(file => {
                    const filePath = path.join(this.cacheDir, file);
                    try {
                        fs.unlinkSync(filePath);
                    } catch (error) {
                        console.error(`Failed to delete cache file ${filePath}:`, error);
                    }
                });
                console.log(`Cleared ${files.length} thumbnail cache files`);
            }
        } catch (error) {
            console.error('Failed to clear thumbnail cache:', error);
        }
    }

    public updateThumbnailSize(size: number): void {
        if (size !== this.thumbnailSize) {
            this.thumbnailSize = size;
            // サイズが変更された場合はキャッシュをクリア
            // （新しいサイズでサムネイルを再生成するため）
            this.clearCache();
            console.log(`Thumbnail size updated to ${size}px, cache cleared`);
        }
    }

    public getCacheStats(): { totalFiles: number, totalSizeBytes: number } {
        let totalFiles = 0;
        let totalSizeBytes = 0;

        try {
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                files.forEach(file => {
                    try {
                        const filePath = path.join(this.cacheDir, file);
                        const stats = fs.statSync(filePath);
                        totalFiles++;
                        totalSizeBytes += stats.size;
                    } catch (error) {
                        console.error(`Failed to get stats for cache file ${file}:`, error);
                    }
                });
            }
        } catch (error) {
            console.error('Failed to get cache stats:', error);
        }

        return { totalFiles, totalSizeBytes };
    }

    public dispose(): void {
        // リソースのクリーンアップ（必要に応じて）
    }
}