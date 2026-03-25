/**
 * GeoJSON Feature 接口
 */
export interface GeoJSONFeature {
    type: 'Feature';
    geometry: any;
    properties: Record<string, any>;
    id?: string | null;
}

/**
 * GeoJSON FeatureCollection 接口
 */
export interface FeatureCollection {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
}

/**
 * 坐标对解析结果
 */
export interface CoordPairResult {
    coordinates: number[];
    time: string | null;
    heartRate: number | null;
}