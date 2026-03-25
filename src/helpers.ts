/**
 * 工具函数模块
 */

import type { CoordPairResult } from './types.ts';

// --- 正则表达式（内部使用）---
const removeSpace = /\s*/g;
const trimSpace = /^\s*|\s*$/g;
const splitSpace = /\s+/;

/**
 * 获取 DOM 元素集合
 */
export const getElementsByTagName = (x: Element | Document, y: string): HTMLCollectionOf<Element> => x.getElementsByTagName(y);
export const getAttribute = (x: Element, y: string): string | null => x.getAttribute(y);

/**
 * 获取第一个子元素
 */
export const getFirstElement = (x: Element | Document, y: string): Element | null => {
    const n = getElementsByTagName(x, y);
    return n.length ? n[0] : null;
};

/**
 * 获取节点文本内容
 */
export function getNodeText(x: Element | null): string {
    if (x && x.normalize) x.normalize();
    return (x && x.textContent) || '';
}

/**
 * 提取多个字段值
 */
export function extractMultiFields(x: Element, ys: string[]): Record<string, string> {
    const o: Record<string, string> = {};
    ys.forEach(y => {
        const n = getFirstElement(x, y);
        if (n) o[y] = getNodeText(n);
    });
    return o;
}

/**
 * 解析单个坐标（KML 格式）
 */
export function parseSingleCoord(v: string): number[] {
    return v.replace(removeSpace, '').split(',').map(val => parseFloat(val));
}

/**
 * 解析坐标数组（KML 格式）
 */
export function parseCoordinates(v: string): number[][] {
    const coords = v.replace(trimSpace, '').split(splitSpace);
    return coords.map(c => parseSingleCoord(c));
}

/**
 * 解析 GPX 坐标对
 */
export function parseGPXCoordinate(x: Element): CoordPairResult {
    const ll = [parseFloat(getAttribute(x, 'lon') || '0'), parseFloat(getAttribute(x, 'lat') || '0')];
    const ele = getFirstElement(x, 'ele');
    const heartRate = getFirstElement(x, 'gpxtpx:hr') || getFirstElement(x, 'hr');
    const time = getFirstElement(x, 'time');

    if (ele) {
        const e = parseFloat(getNodeText(ele));
        if (!isNaN(e)) ll.push(e);
    }

    return {
        coordinates: ll,
        time: time ? getNodeText(time) : null,
        heartRate: heartRate ? parseFloat(getNodeText(heartRate)) : null
    };
}

/**
 * 创建空的 FeatureCollection
 */
export function createFeatureCollection() {
    return { type: 'FeatureCollection' as const, features: [] };
}

/**
 * 解析 KML 颜色值（AABBGGRR 格式）为 RGBA 字符串
 * KML 颜色格式：AABBGGRR (Alpha + Blue + Green + Red)
 * @param kmlColor - KML 颜色字符串，如 "ffffffff" 或 "ff0000ff"
 * @returns RGBA 颜色字符串，如 "rgba(255, 255, 255, 1)" 或 "rgba(255, 0, 0, 1)"
 */
export function parseKMLColor(kmlColor: string): string {
    if (!kmlColor || kmlColor.length < 8) {
        return kmlColor; // 如果格式不正确，返回原值
    }
    
    try {
        // KML 颜色格式为 AABBGGRR（8 位 16 进制）
        const alpha = parseInt(kmlColor.substring(0, 2), 16) / 255;
        const blue = parseInt(kmlColor.substring(2, 4), 16);
        const green = parseInt(kmlColor.substring(4, 6), 16);
        const red = parseInt(kmlColor.substring(6, 8), 16);
        
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    } catch (e) {
        console.warn('解析 KML 颜色失败:', kmlColor, e);
        return kmlColor; // 解析失败时返回原值
    }
}

/**
 * 解析 HTML 表格内容为 JSON 对象
 */
export function parseHTMLTable(html: string): Record<string, any> | null {
    if (!html || !html.includes('<table')) {
        return null;
    }

    try {
        // 移除 CDATA 包裹
        let cleanHtml = html.replace(/<!\[CDATA\[|\]\]>/g, '');
        
        // 创建临时 DOM 元素
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanHtml, 'text/html');
        const tables = doc.getElementsByTagName('table');
        
        if (tables.length === 0) {
            return null;
        }

        const result: Record<string, any> = {};
        
        // 处理最外层表格
        const outerTable = tables[0];
        const rows = outerTable.getElementsByTagName('tr');
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.children;
            
            // 如果是单列，可能是标题行
            if (cells.length === 1) {
                const title = cells[0].textContent?.trim();
                if (title && title !== '') {
                    // 检查是否包含内层表格
                    const innerTable = cells[0].getElementsByTagName('table')[0];
                    if (innerTable) {
                        // 解析内层表格
                        const innerRows = innerTable.getElementsByTagName('tr');
                        for (let j = 0; j < innerRows.length; j++) {
                            const innerRow = innerRows[j];
                            const innerCells = innerRow.children;
                            if (innerCells.length >= 2) {
                                const key = innerCells[0].textContent?.trim() || '';
                                const value = innerCells[1].textContent?.trim() || '';
                                if (key && key !== '') {
                                    result[key] = value;
                                }
                            }
                        }
                    } else if (title) {
                        // 如果没有内层表格，将标题作为 name
                        result['name'] = title;
                    }
                }
            }
        }
        
        return Object.keys(result).length > 0 ? result : null;
    } catch (e) {
        console.warn('解析 HTML 表格失败:', e);
        return null;
    }
}

/**
 * 处理属性值，如果是 HTML 表格则转换为 JSON 对象
 */
export function processPropertyValue(value: string): any {
    if (!value) return '';
    
    // 移除 CDATA 标记并检查是否为空
    const cleanValue = value.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    if (!cleanValue || cleanValue === '') {
        return '';
    }
    
    // 尝试解析为 HTML 表格
    const tableData = parseHTMLTable(value);
    if (tableData) {
        return tableData;
    }
    
    // 如果不是表格，返回清理后的纯文本
    return cleanValue;
}
