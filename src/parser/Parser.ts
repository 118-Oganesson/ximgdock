import { XMLParser, XMLValidator } from 'fast-xml-parser';

export interface ParseError {
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
}

export interface ParseResult {
    isValid: boolean;
    errors: ParseError[];
    data?: any;
}

export class Parser {
    private parser: XMLParser;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            textNodeName: "#text",
            parseAttributeValue: false,
            parseTagValue: false,
            trimValues: true,
            preserveOrder: false
        });
    }

    public validateXHTML(content: string): ParseResult {
        const result: ParseResult = {
            isValid: true,
            errors: []
        };

        try {
            // 基本的なXML構文チェック
            const validationResult = XMLValidator.validate(content);

            if (validationResult !== true) {
                result.isValid = false;
                result.errors.push(this.parseValidationError(validationResult));
                return result;
            }

            // XHTMLとしての追加バリデーション
            const xhtmlErrors = this.validateXHTMLSpecific(content);
            if (xhtmlErrors.length > 0) {
                result.errors.push(...xhtmlErrors);
                result.isValid = xhtmlErrors.some(error => error.severity === 'error');
            }

            // パース可能であれば構造を取得
            if (result.isValid) {
                result.data = this.parser.parse(content);
            }

        } catch (error) {
            result.isValid = false;
            result.errors.push({
                line: 0,
                column: 0,
                message: `パースエラー: ${error}`,
                severity: 'error'
            });
        }

        return result;
    }

    private parseValidationError(validationResult: any): ParseError {
        const error = validationResult.err;
        let line = 0;
        let column = 0;
        let message = 'XML構文エラー';

        if (error) {
            // fast-xml-parserのエラー形式を解析
            if (error.line !== undefined) {
                line = error.line - 1; // VS Codeは0ベースの行番号
            }
            if (error.col !== undefined) {
                column = error.col;
            }
            if (error.msg) {
                message = error.msg;
            } else if (typeof error === 'string') {
                message = error;
            }
        }

        return {
            line,
            column,
            message,
            severity: 'error'
        };
    }

    private validateXHTMLSpecific(content: string): ParseError[] {
        const errors: ParseError[] = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i;

            // 自己終了タグのチェック
            const selfClosingErrors = this.checkSelfClosingTags(line, lineNumber);
            errors.push(...selfClosingErrors);

            // 必須属性のチェック
            const attributeErrors = this.checkRequiredAttributes(line, lineNumber);
            errors.push(...attributeErrors);

            // XHTML DOCTYPE宣言のチェック
            if (i === 0 || (i === 1 && lines[0].startsWith('<?xml'))) {
                const doctypeErrors = this.checkDoctype(line, lineNumber);
                errors.push(...doctypeErrors);
            }
        }

        return errors;
    }

    private checkSelfClosingTags(line: string, lineNumber: number): ParseError[] {
        const errors: ParseError[] = [];
        const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];

        // 自己終了すべき要素が正しく閉じられているかチェック
        voidElements.forEach(element => {
            const regex = new RegExp(`<${element}([^>]*[^/])>`, 'gi');
            let match;

            while ((match = regex.exec(line)) !== null) {
                errors.push({
                    line: lineNumber,
                    column: match.index,
                    message: `<${element}>要素はXHTMLでは自己終了タグである必要があります: <${element}.../>`,
                    severity: 'warning'
                });
            }
        });

        return errors;
    }

    private checkRequiredAttributes(line: string, lineNumber: number): ParseError[] {
        const errors: ParseError[] = [];

        // img要素のalt属性チェック
        const imgMatch = line.match(/<img[^>]*>/gi);
        if (imgMatch) {
            imgMatch.forEach(imgTag => {
                if (!imgTag.includes('alt=')) {
                    const columnIndex = line.indexOf(imgTag);
                    errors.push({
                        line: lineNumber,
                        column: columnIndex,
                        message: '<img>要素にはalt属性が必要です',
                        severity: 'warning'
                    });
                }
            });
        }

        // area要素のalt属性チェック
        const areaMatch = line.match(/<area[^>]*>/gi);
        if (areaMatch) {
            areaMatch.forEach(areaTag => {
                if (!areaTag.includes('alt=')) {
                    const columnIndex = line.indexOf(areaTag);
                    errors.push({
                        line: lineNumber,
                        column: columnIndex,
                        message: '<area>要素にはalt属性が必要です',
                        severity: 'warning'
                    });
                }
            });
        }

        return errors;
    }

    private checkDoctype(line: string, lineNumber: number): ParseError[] {
        const errors: ParseError[] = [];

        if (line.trim().toLowerCase().startsWith('<!doctype html') && !line.includes('XHTML')) {
            errors.push({
                line: lineNumber,
                column: 0,
                message: 'XHTMLファイルにはXHTML DOCTYPE宣言を使用することを推奨します',
                severity: 'warning'
            });
        }

        return errors;
    }

    public getElementAtPosition(content: string, line: number, character: number): string | null {
        const lines = content.split('\n');
        if (line >= lines.length) {
            return null;
        }

        const currentLine = lines[line];
        const beforeCursor = currentLine.substring(0, character);
        const afterCursor = currentLine.substring(character);

        // カーソル位置の前後から要素を特定
        const beforeMatch = beforeCursor.match(/<(\w+)[^>]*$/);
        const afterMatch = afterCursor.match(/^[^>]*>/);

        if (beforeMatch && afterMatch) {
            return beforeMatch[1];
        }

        return null;
    }
}