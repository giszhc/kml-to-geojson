/**
 * 工具函数模块
 */

import type { CoordPairResult } from './types.ts';

// --- 正则表达式（内部使用）---
const removeSpace = /\s*/g;
const trimSpace = /^\s*|\s*$/g;
const splitSpace = /\s+/;

/**
 * 简单的哈希函数
 */
export function generateHash(x: string): number {
    if (!x || !x.length) return 0;
    let h = 0;
    for (let i = 0; i < x.length; i++) {
        h = ((h << 5) - h) + x.charCodeAt(i) | 0;
    }
    return h;
}

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
 * 规范化元素（内部使用）
 */
function normalizeNode(el: Element): Element {
    if (el.normalize) el.normalize();
    return el;
}

/**
 * 字符串数组转数字数组（内部使用）
 */
function parseNumberArray(x: string[]): number[] {
    return x.map(val => parseFloat(val));
}

/**
 * 获取节点文本内容
 */
export function getNodeText(x: Element | null): string {
    if (x) normalizeNode(x);
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
    return parseNumberArray(v.replace(removeSpace, '').split(','));
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
    const ll = [getAttributeFloat(x, 'lon'), getAttributeFloat(x, 'lat')];
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
 * XML 转字符串
 */
const serializer = new XMLSerializer();
export function xmlToString(str: Element | Document): string {
    return serializer.serializeToString(str);
}

/**
 * 获取元素属性浮点数值（内部使用）
 */
function getAttributeFloat(x: Element, y: string): number {
    return parseFloat(getAttribute(x, y) || '0');
}