/**
 * 针对 KML/GPX 转 GeoJSON 的轻量级工具 (TS 版本)
 */

import type { GeoJSONFeature, FeatureCollection } from './types.ts';
import { 
    getElementsByTagName, getFirstElement, getAttribute, getNodeText, generateHash, xmlToString, 
    parseCoordinates, parseSingleCoord, createFeatureCollection, extractMultiFields, parseGPXCoordinate 
} from './helpers';

/**
 * 从 URL 加载 XML 文档
 */
async function loadFromURL(url: string): Promise<Document> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`无法加载 URL: ${url}, 状态码：${response.status}`);
    }
    const text = await response.text();
    return parseXML(text);
}

/**
 * 解析 XML 字符串为 Document 对象
 */
function parseXML(str: string): Document {
    const parser = new DOMParser();
    const doc = parser.parseFromString(str, 'text/xml');
    
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('XML 解析失败');
    }
    
    return doc;
}

/**
 * 判断是否为 URL
 */
function isURL(str: string): boolean {
    return /^https?:\/\//i.test(str);
}

/**
 * 解析 KML 文档为 GeoJSON
 * @param input - Document 对象、URL 字符串或 KML 内容字符串
 * @returns GeoJSON FeatureCollection
 */
export async function kmlToGeoJSON(input: Document | string): Promise<FeatureCollection> {
    let doc: Document;
    
    if (input instanceof Document) {
        doc = input;
    } else if (isURL(input)) {
        doc = await loadFromURL(input);
    } else {
        // 假设是 XML 字符串
        doc = parseXML(input);
    }
    const gj = createFeatureCollection();
    const styleIndex: Record<string, string> = {};
    const geotypes = ['Polygon', 'LineString', 'Point', 'Track', 'gx:Track'];

    const placemarks = getElementsByTagName(doc, 'Placemark');
    const styles = getElementsByTagName(doc, 'Style');

    for (let k = 0; k < styles.length; k++) {
        const hash = generateHash(xmlToString(styles[k])).toString(16);
        styleIndex['#' + getAttribute(styles[k], 'id')] = hash;
    }

    for (let j = 0; j < placemarks.length; j++) {
        // @ts-ignore
        gj.features = gj.features.concat(extractPlacemark(placemarks[j]));
    }

    function extractGeometry(root: Element): { geoms: any[] } {
        let geoms: any[] = [];
        
        if (getFirstElement(root, 'MultiGeometry')) return extractGeometry(getFirstElement(root, 'MultiGeometry')!);
        if (getFirstElement(root, 'MultiTrack')) return extractGeometry(getFirstElement(root, 'MultiTrack')!);
        if (getFirstElement(root, 'gx:MultiTrack')) return extractGeometry(getFirstElement(root, 'gx:MultiTrack')!);

        geotypes.forEach(type => {
            const nodes = getElementsByTagName(root, type);
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (type === 'Point') {
                    geoms.push({ type: 'Point', coordinates: parseSingleCoord(getNodeText(getFirstElement(node, 'coordinates'))) });
                } else if (type === 'LineString') {
                    geoms.push({ type: 'LineString', coordinates: parseCoordinates(getNodeText(getFirstElement(node, 'coordinates'))) });
                } else if (type === 'Polygon') {
                    const rings = getElementsByTagName(node, 'LinearRing');
                    const coords = Array.from(rings).map(r => parseCoordinates(getNodeText(getFirstElement(r, 'coordinates'))));
                    geoms.push({ type: 'Polygon', coordinates: coords });
                }
            }
        });
        return { geoms };
    }

    function extractPlacemark(root: Element): GeoJSONFeature[] {
        const { geoms } = extractGeometry(root);
        if (!geoms.length) return [];
        
        const properties: Record<string, any> = {
            name: getNodeText(getFirstElement(root, 'name')),
            address: getNodeText(getFirstElement(root, 'address')),
            description: processPropertyValue(getNodeText(getFirstElement(root, 'description')))
        };

        const styleUrl = getNodeText(getFirstElement(root, 'styleUrl'));
        if (styleUrl) {
            const cleanUrl = styleUrl.startsWith('#') ? styleUrl : '#' + styleUrl;
            properties.styleUrl = cleanUrl;
            if (styleIndex[cleanUrl]) properties.styleHash = styleIndex[cleanUrl];
        }

        const feature: GeoJSONFeature = {
            type: 'Feature',
            geometry: geoms.length === 1 ? geoms[0] : { type: 'GeometryCollection', geometries: geoms },
            properties: properties
        };

        const id = getAttribute(root, 'id');
        if (id) feature.id = id;

        return [feature];
    }

    return gj;
}

/**
 * 解析 HTML 表格内容为 JSON 对象
 */
function parseHTMLTable(html: string): Record<string, any> | null {
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
function processPropertyValue(value: string): any {
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

/**
 * 解析 GPX 文档为 GeoJSON
 * @param input - Document 对象、URL 字符串或 GPX 内容字符串
 * @returns GeoJSON FeatureCollection
 */
export async function gpxToGeoJSON(input: Document | string): Promise<FeatureCollection> {
    let doc: Document;
    
    if (input instanceof Document) {
        doc = input;
    } else if (isURL(input)) {
        doc = await loadFromURL(input);
    } else {
        // 假设是 XML 字符串
        doc = parseXML(input);
    }
    const gj = createFeatureCollection();
    const tracks = getElementsByTagName(doc, 'trk');

    for (let i = 0; i < tracks.length; i++) {
        const f = extractTrack(tracks[i]);
        if (f) { // @ts-ignore
            gj.features.push(f);
        }
    }

    function extractTrack(node: Element): GeoJSONFeature | undefined {
        const segments = getElementsByTagName(node, 'trkseg');
        const track: number[][][] = [];
        for (let i = 0; i < segments.length; i++) {
            const pts = getElementsByTagName(segments[i], 'trkpt');
            if (pts.length < 2) continue;
            const line = Array.from(pts).map(p => parseGPXCoordinate(p).coordinates);
            track.push(line);
        }
        if (!track.length) return;
        return {
            type: 'Feature',
            properties: extractMultiFields(node, ['name', 'desc']),
            geometry: {
                type: track.length === 1 ? 'LineString' : 'MultiLineString',
                coordinates: track.length === 1 ? track[0] : track
            }
        };
    }

    return gj;
}