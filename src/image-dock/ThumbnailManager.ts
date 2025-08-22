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
        this.thumbnailSize = config.get<number>('thumbnailSize', 64);
    }

    private ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    public async getThumbnail(imageUri: vscode.Uri): Promise<vscode.Uri> {
        if (!sharp) {
            // sharpが利用できない場合はデフォルトアイコンを返す
            return vscode.Uri.parse('$(file-media)');
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
            throw error;
        }
    }

    private generateHash(filePath: string): string {
        const stats = fs.statSync(filePath);
        const data = `${filePath}:${stats.mtime.getTime()}:${stats.size}`;
        return crypto.createHash('md5').update(data).digest('hex');
    }

    private async generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
        if (!sharp) {
            throw new Error('Sharp module not available');
        }

        const fileExtension = path.extname(inputPath).toLowerCase();

        if (fileExtension === '.svg') {
            // SVGの場合は特別な処理が必要
            await this.generateSVGThumbnail(inputPath, outputPath);
        } else {
            // 一般的な画像ファイル
            await sharp(inputPath)
                .resize(this.thumbnailSize, this.thumbnailSize, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .png()
                .toFile(outputPath);
        }
    }

    private async generateSVGThumbnail(inputPath: string, outputPath: string): Promise<void> {
        try {
            // SVGファイルをPNGに変換
            const svgBuffer = fs.readFileSync(inputPath);
            await sharp(svgBuffer, { density: 150 })
                .resize(this.thumbnailSize, this.thumbnailSize, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .png()
                .toFile(outputPath);
        } catch (error) {
            // SVG処理に失敗した場合、デフォルトのサムネイルを作成
            await this.createDefaultThumbnail(outputPath);
        }
    }

    private async createDefaultThumbnail(outputPath: string): Promise<void> {
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
    }

    public clearCache(): void {
        try {
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                files.forEach(file => {
                    const filePath = path.join(this.cacheDir, file);
                    fs.unlinkSync(filePath);
                });
            }
        } catch (error) {
            console.error('Failed to clear thumbnail cache:', error);
        }
    }

    public updateThumbnailSize(size: number): void {
        if (size !== this.thumbnailSize) {
            this.thumbnailSize = size;
            // サイズが変更された場合はキャッシュをクリア
            this.clearCache();
        }
    }
}