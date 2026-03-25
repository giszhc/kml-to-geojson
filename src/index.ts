/**
 * 针对 KML/GPX 转 GeoJSON 的轻量级工具 (TS 版本)
 */

import type {FeatureCollection, GeoJSONFeature} from './types.ts';
import {
    createFeatureCollection,
    extractMultiFields,
    getAttribute,
    getElementsByTagName,
    getFirstElement,
    getNodeText,
    parseCoordinates,
    parseGPXCoordinate,
    parseSingleCoord,
    parseKMLColor,
    processPropertyValue
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
    const geotypes = ['Polygon', 'LineString', 'Point', 'Track', 'gx:Track'];

    const placemarks = getElementsByTagName(doc, 'Placemark');
    const styles = getElementsByTagName(doc, 'Style');

    // 构建样式索引（id -> 样式属性对象）
    const styleMap: Record<string, Record<string, any>> = {};
    for (let k = 0; k < styles.length; k++) {
        const styleId = getAttribute(styles[k], 'id');
        if (styleId) {
            styleMap['#' + styleId] = extractStyleProperties(styles[k]);
        }
    }

    // 解析地物标记，同时收集父级属性
    for (let j = 0; j < placemarks.length; j++) {
        // 获取当前 Placemark 的所有父级元素（Document、Folder 等）
        const parentProperties = collectParentProperties(placemarks[j]);
        // @ts-ignore
        gj.features = gj.features.concat(extractPlacemark(placemarks[j], parentProperties));
    }

    /**
     * 提取样式的详细属性
     */
    function extractStyleProperties(styleElement: Element): Record<string, any> {
        const properties: Record<string, any> = {};
        
        // 提取 IconStyle
        const iconStyle = getFirstElement(styleElement, 'IconStyle');
        if (iconStyle) {
            const color = getNodeText(getFirstElement(iconStyle, 'color'));
            const scale = getNodeText(getFirstElement(iconStyle, 'scale'));
            const heading = getNodeText(getFirstElement(iconStyle, 'heading'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (scale && scale !== '') properties['style:scale'] = parseFloat(scale);
            if (heading && heading !== '') properties['style:heading'] = parseFloat(heading);
            
            // 提取 Icon href
            const icon = getFirstElement(iconStyle, 'Icon');
            if (icon) {
                const href = getNodeText(getFirstElement(icon, 'href'));
                if (href && href !== '') properties['style:iconHref'] = href;
            }
        }
        
        // 提取 LineStyle
        const lineStyle = getFirstElement(styleElement, 'LineStyle');
        if (lineStyle) {
            const color = getNodeText(getFirstElement(lineStyle, 'color'));
            const width = getNodeText(getFirstElement(lineStyle, 'width'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (width && width !== '') properties['style:width'] = parseFloat(width);
        }
        
        // 提取 PolyStyle
        const polyStyle = getFirstElement(styleElement, 'PolyStyle');
        if (polyStyle) {
            const color = getNodeText(getFirstElement(polyStyle, 'color'));
            const fill = getNodeText(getFirstElement(polyStyle, 'fill'));
            const outline = getNodeText(getFirstElement(polyStyle, 'outline'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (fill && fill !== '') properties['style:fill'] = fill === '1';
            if (outline && outline !== '') properties['style:outline'] = outline === '1';
        }
        
        // 提取 LabelStyle
        const labelStyle = getFirstElement(styleElement, 'LabelStyle');
        if (labelStyle) {
            const color = getNodeText(getFirstElement(labelStyle, 'color'));
            const scale = getNodeText(getFirstElement(labelStyle, 'scale'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (scale && scale !== '') properties['style:scale'] = parseFloat(scale);
        }
        
        return properties;
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

    /**
     * 收集父级元素的属性信息
     * 从根节点到当前元素的所有父级 (Document、Folder 等) 的 name 都会收集到 group 数组中
     */
    function collectParentProperties(element: Element): Record<string, any> {
        const properties: Record<string, any> = {};
        const groupNames: string[] = [];
        let parent = element.parentElement;
        
        // 向上遍历所有父级元素，收集 name 属性
        while (parent && parent.tagName !== 'kml') {
            const parentName = getNodeText(getFirstElement(parent, 'name'));
            if (parentName && parentName !== '') {
                groupNames.unshift(parentName); // 添加到数组开头，保持从外到内的顺序
            }
            
            // 继续向上遍历
            parent = parent.parentElement;
        }
        
        // 只有当有分组信息时才添加 group 属性
        if (groupNames.length > 0) {
            properties.group = groupNames;
        }
        
        return properties;
    }

    function extractPlacemark(root: Element, parentProperties: Record<string, any> = {}): GeoJSONFeature[] {
        const { geoms } = extractGeometry(root);
        if (!geoms.length) return [];
        
        // 先合并父级属性
        const properties: Record<string, any> = { ...parentProperties };
        
        // 添加当前 Placemark 的属性
        const currentName = getNodeText(getFirstElement(root, 'name'));
        const currentAddress = getNodeText(getFirstElement(root, 'address'));
        const currentDescription = getNodeText(getFirstElement(root, 'description'));
        
        if (currentName && currentName !== '') properties.name = currentName;
        if (currentAddress && currentAddress !== '') properties.address = currentAddress;
        if (currentDescription && currentDescription !== '') properties.description = processPropertyValue(currentDescription);

        const styleUrl = getNodeText(getFirstElement(root, 'styleUrl'));
        if (styleUrl) {
            const cleanUrl = styleUrl.startsWith('#') ? styleUrl : '#' + styleUrl;
            properties.styleUrl = cleanUrl;
            
            // 如果样式库中有该样式，合并其属性
            if (styleMap[cleanUrl]) {
                Object.assign(properties, styleMap[cleanUrl]);
            }
        }
        
        // 检查是否有内联 Style
        const inlineStyle = getFirstElement(root, 'Style');
        if (inlineStyle) {
            const inlineStyleProps = extractStyleProperties(inlineStyle);
            Object.assign(properties, inlineStyleProps);
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
 * 解析 OVKML 文档为 GeoJSON
 * @param input - Document 对象、URL 字符串或 OVKML 内容字符串
 * @returns GeoJSON FeatureCollection
 */
export async function ovkmlToGeoJSON(input: Document | string): Promise<FeatureCollection> {
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
    const styleMap: Record<string, Record<string, any>> = {};
    const geotypes = ['Polygon', 'LineString', 'Point', 'Track', 'gx:Track'];

    // 构建样式索引（id -> 样式属性对象）
    const styles = getElementsByTagName(doc, 'Style');
    for (let k = 0; k < styles.length; k++) {
        const styleId = getAttribute(styles[k], 'id');
        if (styleId) {
            styleMap['#' + styleId] = extractStyleProperties(styles[k]);
        }
    }

    // 解析地物标记，同时收集父级属性
    const placemarks = getElementsByTagName(doc, 'Placemark');
    for (let j = 0; j < placemarks.length; j++) {
        // 获取当前 Placemark 的所有父级元素（Document、Folder 等）
        const parentProperties = collectParentProperties(placemarks[j]);
        // @ts-ignore
        gj.features = gj.features.concat(extractPlacemark(placemarks[j], parentProperties));
    }

    /**
     * 提取样式的详细属性
     */
    function extractStyleProperties(styleElement: Element): Record<string, any> {
        const properties: Record<string, any> = {};
        
        // 提取 IconStyle
        const iconStyle = getFirstElement(styleElement, 'IconStyle');
        if (iconStyle) {
            const color = getNodeText(getFirstElement(iconStyle, 'color'));
            const scale = getNodeText(getFirstElement(iconStyle, 'scale'));
            const heading = getNodeText(getFirstElement(iconStyle, 'heading'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (scale && scale !== '') properties['style:scale'] = parseFloat(scale);
            if (heading && heading !== '') properties['style:heading'] = parseFloat(heading);
            
            // 提取 Icon href
            const icon = getFirstElement(iconStyle, 'Icon');
            if (icon) {
                const href = getNodeText(getFirstElement(icon, 'href'));
                if (href && href !== '') properties['style:iconHref'] = href;
            }
        }
        
        // 提取 LineStyle
        const lineStyle = getFirstElement(styleElement, 'LineStyle');
        if (lineStyle) {
            const color = getNodeText(getFirstElement(lineStyle, 'color'));
            const width = getNodeText(getFirstElement(lineStyle, 'width'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (width && width !== '') properties['style:width'] = parseFloat(width);
        }
        
        // 提取 PolyStyle
        const polyStyle = getFirstElement(styleElement, 'PolyStyle');
        if (polyStyle) {
            const color = getNodeText(getFirstElement(polyStyle, 'color'));
            const fill = getNodeText(getFirstElement(polyStyle, 'fill'));
            const outline = getNodeText(getFirstElement(polyStyle, 'outline'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (fill && fill !== '') properties['style:fill'] = fill === '1';
            if (outline && outline !== '') properties['style:outline'] = outline === '1';
        }
        
        // 提取 LabelStyle
        const labelStyle = getFirstElement(styleElement, 'LabelStyle');
        if (labelStyle) {
            const color = getNodeText(getFirstElement(labelStyle, 'color'));
            const scale = getNodeText(getFirstElement(labelStyle, 'scale'));
            
            if (color && color !== '') properties['style:color'] = parseKMLColor(color);
            if (scale && scale !== '') properties['style:scale'] = parseFloat(scale);
        }
        
        return properties;
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

    /**
     * 收集父级元素的属性信息
     * 从根节点到当前元素的所有父级 (Document、Folder 等) 的 name 都会收集到 group 数组中
     */
    function collectParentProperties(element: Element): Record<string, any> {
        const properties: Record<string, any> = {};
        const groupNames: string[] = [];
        let parent = element.parentElement;
            
        // 向上遍历所有父级元素，收集 name 属性
        while (parent && parent.tagName !== 'kml') {
            const parentName = getNodeText(getFirstElement(parent, 'name'));
            if (parentName && parentName !== '') {
                groupNames.unshift(parentName); // 添加到数组开头，保持从外到内的顺序
            }
                
            // 继续向上遍历
            parent = parent.parentElement;
        }
            
        // 只有当有分组信息时才添加 group 属性
        if (groupNames.length > 0) {
            properties.group = groupNames;
        }
            
        return properties;
    }
    
    function extractPlacemark(root: Element, parentProperties: Record<string, any> = {}): GeoJSONFeature[] {
        const { geoms } = extractGeometry(root);
        if (!geoms.length) return [];
        
        // 先合并父级属性
        const properties: Record<string, any> = { ...parentProperties };
        
        // 添加当前 Placemark 的属性
        const currentName = getNodeText(getFirstElement(root, 'name'));
        const currentAddress = getNodeText(getFirstElement(root, 'address'));
        const currentDescription = getNodeText(getFirstElement(root, 'description'));
        const currentCategory = getNodeText(getFirstElement(root, 'category'));
        const currentType = getNodeText(getFirstElement(root, 'type'));
        const currentLevel = getNodeText(getFirstElement(root, 'level'));
        
        if (currentName && currentName !== '') properties.name = currentName;
        if (currentAddress && currentAddress !== '') properties.address = currentAddress;
        if (currentDescription && currentDescription !== '') properties.description = processPropertyValue(currentDescription);
        if (currentCategory && currentCategory !== '') properties.category = currentCategory;
        if (currentType && currentType !== '') properties.type = currentType;
        if (currentLevel && currentLevel !== '') properties.level = currentLevel;

        const styleUrl = getNodeText(getFirstElement(root, 'styleUrl'));
        if (styleUrl) {
            const cleanUrl = styleUrl.startsWith('#') ? styleUrl : '#' + styleUrl;
            properties.styleUrl = cleanUrl;
            
            // 如果样式库中有该样式，合并其属性
            if (styleMap[cleanUrl]) {
                Object.assign(properties, styleMap[cleanUrl]);
            }
        }
        
        // 检查是否有内联 Style
        const inlineStyle = getFirstElement(root, 'Style');
        if (inlineStyle) {
            const inlineStyleProps = extractStyleProperties(inlineStyle);
            Object.assign(properties, inlineStyleProps);
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

/**
 * 解析 OVJSN 文档为 GeoJSON
 * OVJSN 是一种特殊的层级数据格式，包含 ObjItems 和 ObjChildren 嵌套结构
 * 支持两种格式：
 * 1. 标准 GeoJSON 格式（FeatureCollection）
 * 2. OVJSN 特有格式（包含 Version, Type, ObjItems 等字段）
 * @param input - FeatureCollection 对象、OVJSN 对象、URL 字符串或 JSON 内容字符串
 * @returns GeoJSON FeatureCollection
 */
export async function ovjsnToGeoJSON(input: FeatureCollection | Record<string, any> | string): Promise<FeatureCollection> {
    let data: any;
    
    if (typeof input === 'string') {
        // 检查是否是 URL
        if (isURL(input)) {
            // 从 URL 加载
            const response = await fetch(input);
            if (!response.ok) {
                throw new Error(`无法加载 URL: ${input}, 状态码：${response.status}`);
            }
            data = await response.json();
        } else {
            // 假设是 JSON 字符串
            try {
                data = JSON.parse(input);
            } catch (e) {
                throw new Error('无效的 OVJSN 格式：' + (e as Error).message);
            }
        }
    } else {
        // 已经是对象
        data = input;
    }
    
    // 判断是标准 GeoJSON 还是 OVJSN 特有格式
    if (data.type === 'FeatureCollection') {
        // 标准 GeoJSON 格式
        return processStandardGeoJSON(data);
    } else if (data.ObjItems || data.Version) {
        // OVJSN 特有格式，需要递归解析
        return processOVJSNFormat(data);
    } else {
        throw new Error('无效的 OVJSN 格式：必须是 FeatureCollection 类型或包含 ObjItems 的 OVJSN 格式');
    }
}

/**
 * 处理标准 GeoJSON 格式
 */
function processStandardGeoJSON(geojson: FeatureCollection): FeatureCollection {
    // 验证是否为有效的 GeoJSON
    if (!geojson || geojson.type !== 'FeatureCollection') {
        throw new Error('无效的 GeoJSON 格式：必须是 FeatureCollection 类型');
    }
    
    // 如果没有 features 数组，创建一个空的
    if (!Array.isArray(geojson.features)) {
        geojson.features = [];
    }
    
    // 确保每个 feature 都有正确的 type
    geojson.features = geojson.features.map(feature => {
        if (!feature.type) {
            feature.type = 'Feature';
        }
        return feature;
    });
    
    return geojson;
}

/**
 * 处理 OVJSN 特有格式（包含 Version, Type, ObjItems 等）
 */
function processOVJSNFormat(ovjsnData: Record<string, any>): FeatureCollection {
    const geojson: FeatureCollection = {
        type: 'FeatureCollection',
        features: []
    };
    
    // 递归遍历所有对象
    function traverseObjects(objItems: any[], parentGroups: string[] = []) {
        for (const item of objItems) {
            const obj = item.Object;
            if (!obj) continue;
            
            const currentGroups = [...parentGroups];
            if (obj.Name) {
                currentGroups.push(obj.Name);
            }
            
            // 如果是点要素（Type=7），创建 Feature
            if (item.Type === 7 && obj.ObjectDetail) {
                const detail = obj.ObjectDetail;
                if (detail.Lat !== undefined && detail.Lng !== undefined) {
                    const feature: any = {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [detail.Lng, detail.Lat] // GeoJSON 要求 [lng, lat]
                        },
                        properties: {
                            name: obj.Name,
                            group: currentGroups.length > 0 ? currentGroups : undefined
                        }
                    };
                    
                    // 添加其他属性
                    if (obj.Comment) feature.properties.comment = obj.Comment;
                    if (item.SrvID) feature.properties.srvId = item.SrvID;
                    if (item.ObjID) feature.properties.objId = item.ObjID;
                    if (item.ParentID) feature.properties.parentId = item.ParentID;
                    if (item.tmModify) feature.properties.modifyTime = item.tmModify;
                    
                    // 添加 ObjectDetail 中的其他有用属性
                    if (detail.Altitude !== undefined) feature.properties.altitude = detail.Altitude;
                    if (detail.EditMode !== undefined) feature.properties.editMode = detail.EditMode;
                    if (detail.Time) feature.properties.time = detail.Time;
                    
                    geojson.features.push(feature);
                }
            }
            
            // 如果有子对象（分组或更多要素），递归处理
            if (obj.ObjectDetail && obj.ObjectDetail.ObjChildren) {
                traverseObjects(obj.ObjectDetail.ObjChildren, currentGroups);
            }
            
            // 兼容某些格式：直接在 item 中包含 ObjChildren
            if (item.ObjChildren) {
                traverseObjects(item.ObjChildren, currentGroups);
            }
        }
    }
    
    // 从根节点开始遍历
    if (ovjsnData.ObjItems) {
        traverseObjects(ovjsnData.ObjItems);
    }
    
    return geojson;
}