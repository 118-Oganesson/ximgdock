import * as vscode from 'vscode';
import { Parser, ParseResult, ParseError } from '../parser/Parser';

export class DiagnosticManager {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private parser: Parser;
    private updateTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ximgdock');
        this.parser = new Parser();
    }

    public updateDiagnostics(document: vscode.TextDocument) {
        if (document.languageId !== 'xhtml' && document.languageId !== 'xml') {
            return;
        }

        const documentUri = document.uri.toString();

        // 既存のタイマーをクリア
        const existingTimer = this.updateTimers.get(documentUri);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // デバウンス処理
        const config = vscode.workspace.getConfiguration('ximgdock');
        const debounceDelay = config.get<number>('diagnosticDebounceDelay', 300);

        const timer = setTimeout(() => {
            this.doUpdateDiagnostics(document);
            this.updateTimers.delete(documentUri);
        }, debounceDelay);

        this.updateTimers.set(documentUri, timer);
    }

    private doUpdateDiagnostics(document: vscode.TextDocument) {
        const content = document.getText();
        const parseResult = this.parser.validateXHTML(content);

        const diagnostics = this.convertToDiagnostics(parseResult, document);
        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private convertToDiagnostics(parseResult: ParseResult, document: vscode.TextDocument): vscode.Diagnostic[] {
        return parseResult.errors.map(error => this.createDiagnostic(error, document));
    }

    private createDiagnostic(error: ParseError, document: vscode.TextDocument): vscode.Diagnostic {
        // エラーの位置を取得
        const line = Math.max(0, Math.min(error.line, document.lineCount - 1));
        const lineText = document.lineAt(line).text;
        const startCharacter = Math.max(0, Math.min(error.column, lineText.length));

        // エラーの範囲を決定（単語またはタグ全体を含むように拡張）
        const range = this.getErrorRange(document, line, startCharacter, error.message);

        // 診断の重要度を設定
        const severity = error.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;

        const diagnostic = new vscode.Diagnostic(
            range,
            error.message,
            severity
        );

        // 診断のソースを設定
        diagnostic.source = 'XImgDock';

        // エラーコードを設定（可能であれば）
        diagnostic.code = this.getErrorCode(error.message);

        // 関連情報を追加（必要に応じて）
        diagnostic.relatedInformation = this.getRelatedInformation(error);

        return diagnostic;
    }

    private getErrorRange(document: vscode.TextDocument, line: number, startCharacter: number, message: string): vscode.Range {
        const lineText = document.lineAt(line).text;

        // XMLタグエラーの場合、タグ全体をハイライト
        if (message.includes('<') && message.includes('>')) {
            const tagStart = lineText.indexOf('<', startCharacter);
            if (tagStart >= 0) {
                const tagEnd = lineText.indexOf('>', tagStart);
                if (tagEnd >= 0) {
                    return new vscode.Range(line, tagStart, line, tagEnd + 1);
                }
            }
        }

        // 属性エラーの場合、属性名をハイライト
        if (message.includes('属性')) {
            const wordMatch = lineText.match(/\b\w+\b/g);
            if (wordMatch) {
                for (const word of wordMatch) {
                    const wordIndex = lineText.indexOf(word, startCharacter);
                    if (wordIndex >= 0) {
                        return new vscode.Range(line, wordIndex, line, wordIndex + word.length);
                    }
                }
            }
        }

        // デフォルト: 現在の文字から単語の終わりまで
        let endCharacter = startCharacter;
        while (endCharacter < lineText.length && /\w/.test(lineText[endCharacter])) {
            endCharacter++;
        }

        if (endCharacter === startCharacter) {
            endCharacter = Math.min(startCharacter + 1, lineText.length);
        }

        return new vscode.Range(line, startCharacter, line, endCharacter);
    }

    private getErrorCode(message: string): string {
        // メッセージの内容に基づいてエラーコードを生成
        if (message.includes('XML構文エラー')) {
            return 'XML001';
        }
        if (message.includes('自己終了タグ')) {
            return 'XHTML001';
        }
        if (message.includes('alt属性')) {
            return 'XHTML002';
        }
        if (message.includes('DOCTYPE')) {
            return 'XHTML003';
        }
        return 'GENERAL001';
    }

    private getRelatedInformation(error: ParseError): vscode.DiagnosticRelatedInformation[] {
        const relatedInfo: vscode.DiagnosticRelatedInformation[] = [];

        // エラーの種類に応じて関連情報を追加
        if (error.message.includes('alt属性')) {
            // alt属性に関する説明を追加
            relatedInfo.push(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(vscode.Uri.parse('https://www.w3.org/WAI/tutorials/images/'), new vscode.Range(0, 0, 0, 0)),
                'alt属性はアクセシビリティのために重要です'
            ));
        }

        if (error.message.includes('自己終了タグ')) {
            relatedInfo.push(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(vscode.Uri.parse('https://www.w3.org/TR/xhtml1/'), new vscode.Range(0, 0, 0, 0)),
                'XHTMLでは空要素は自己終了タグとして記述する必要があります'
            ));
        }

        return relatedInfo;
    }

    public clearDiagnostics(document: vscode.TextDocument) {
        this.diagnosticCollection.delete(document.uri);
    }

    public clearAllDiagnostics() {
        this.diagnosticCollection.clear();
    }

    public dispose() {
        // 全てのタイマーをクリア
        this.updateTimers.forEach(timer => clearTimeout(timer));
        this.updateTimers.clear();

        // 診断コレクションを破棄
        this.diagnosticCollection.dispose();
    }
}