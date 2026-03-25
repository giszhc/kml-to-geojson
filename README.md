# kml-to-geojson

一个简单、轻量的 JavaScript / TypeScript 工具库，用于将 **KML** 或 **GPX** 文件转换为 **GeoJSON** 格式。

支持以下特性：

- **支持 KML 格式** - Point, LineString, Polygon, MultiGeometry, Track 等
- **支持 GPX 格式** - Track, Route, Waypoint 等
- **支持本地文件和网络 URL** - 可直接传入 Document 对象或 HTTP(S) URL
- **保留样式和属性信息** - name, address, description, styleUrl 等
- **异步处理** - 支持 Promise，方便现代 JavaScript 开发
- **Tree Shaking 友好** - 支持按需引入

---

## API

### kmlToGeoJSON(input: Document | string): Promise<FeatureCollection>

将 KML 文档或 URL 转换为 GeoJSON FeatureCollection

**参数：**
- `input` - 可以是：
  - DOM Document 对象
  - KML 文件的 URL 字符串（以 `http://` 或 `https://` 开头）
  - KML 文件内容的字符串

**返回：**
- `Promise<FeatureCollection>` - GeoJSON FeatureCollection 对象

**示例：**

```typescript
import { kmlToGeoJSON } from '@giszhc/kml-to-geojson';

// 方式 1：从本地文件读取
const fileInput = document.getElementById('file');
const file = fileInput.files[0];
const text = await file.text();
const geojson = await kmlToGeoJSON(text);
console.log(geojson); // FeatureCollection
```

```typescript
import { kmlToGeoJSON } from '@giszhc/kml-to-geojson';

// 方式 2：从网络 URL 加载
const geojson = await kmlToGeoJSON('https://example.com/data.kml');
console.log(geojson); // FeatureCollection
```

```typescript
import { kmlToGeoJSON } from '@giszhc/kml-to-geojson';

// 方式 3：直接传入 XML 字符串
const kmlContent = `
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <Point>
        <coordinates>120.5,30.2</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>
`;
const geojson = await kmlToGeoJSON(kmlContent);
console.log(geojson); // FeatureCollection
```

### gpxToGeoJSON(input: Document | string): Promise<FeatureCollection>

将 GPX 文档或 URL 转换为 GeoJSON FeatureCollection

**参数：**
- `input` - 可以是：
  - DOM Document 对象
  - GPX 文件的 URL 字符串（以 `http://` 或 `https://` 开头）
  - GPX 文件内容的字符串

**返回：**
- `Promise<FeatureCollection>` - GeoJSON FeatureCollection 对象

**示例：**

```typescript
import { gpxToGeoJSON } from '@giszhc/kml-to-geojson';

// 方式 1：从本地文件读取
const fileInput = document.getElementById('file');
const file = fileInput.files[0];
const text = await file.text();
const geojson = await gpxToGeoJSON(text);
console.log(geojson); // FeatureCollection
```

```typescript
import { gpxToGeoJSON } from '@giszhc/kml-to-geojson';

// 方式 2：从网络 URL 加载
const geojson = await gpxToGeoJSON('https://example.com/track.gpx');
console.log(geojson); // FeatureCollection
```

```typescript
import { gpxToGeoJSON } from '@giszhc/kml-to-geojson';

// 方式 3：直接传入 XML 字符串
const gpxContent = `
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Example">
  <trk>
    <name>徒步轨迹</name>
    <trkseg>
      <trkpt lat="30.1" lon="120.2"></trkpt>
      <trkpt lat="30.2" lon="120.3"></trkpt>
    </trkseg>
  </trk>
</gpx>
`;
const geojson = await gpxToGeoJSON(gpxContent);
console.log(geojson); // FeatureCollection
```

---

## 支持的几何类型

**KML:**
- Point
- LineString
- Polygon
- MultiGeometry
- Track / gx:Track

**GPX:**
- Track (trk)
- Route (rte)
- Waypoint (wpt)

---

## 输出示例

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [120.5, 30.2]
      },
      "properties": {
        "name": "示例地点",
        "address": "测试地址",
        "description": "描述信息"
      }
    }
  ]
}
```

---

## 安装

你可以通过 npm 或 pnpm 安装该库：

```bash
pnpm install @giszhc/kml-to-geojson
# 或
npm install @giszhc/kml-to-geojson
```

---

## 浏览器环境使用示例

### 从本地文件转换

```html
<input type="file" id="fileInput" accept=".kml,.gpx">
<button onclick="convert()">转换</button>

<script type="module">
import { kmlToGeoJSON, gpxToGeoJSON } from '@giszhc/kml-to-geojson';

async function convert() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    
    let geojson;
    if (file.name.endsWith('.kml')) {
        geojson = await kmlToGeoJSON(doc);
    } else if (file.name.endsWith('.gpx')) {
        geojson = await gpxToGeoJSON(doc);
    }
    
    console.log(JSON.stringify(geojson, null, 2));
}
</script>
```

### 从网络 URL 转换

```typescript
import { kmlToGeoJSON, gpxToGeoJSON } from '@giszhc/kml-to-geojson';

// 转换 KML
const kmlGeoJSON = await kmlToGeoJSON('https://example.com/regions.kml');
console.log(kmlGeoJSON);

// 转换 GPX
const gpxGeoJSON = await gpxToGeoJSON('https://example.com/hiking-track.gpx');
console.log(gpxGeoJSON);
```

### 结合地图库使用（Leaflet）

```typescript
import { kmlToGeoJSON } from '@giszhc/kml-to-geojson';
import L from 'leaflet';

const map = L.map('map').setView([30, 120], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 加载 KML 并显示在地图上
const geojson = await kmlToGeoJSON('https://example.com/data.kml');
L.geoJSON(geojson).addTo(map);
```

---

## 注意事项

1. **浏览器环境** - 需要在浏览器环境中运行，依赖 `DOMParser`、`XMLSerializer` 和 `fetch` API
2. **CORS** - 从网络 URL 加载文件时，需要确保目标服务器支持跨域请求
3. **异步处理** - 所有转换方法都是异步的，需要使用 `await` 或 `.then()`
4. **错误处理** - 建议添加 try-catch 块来处理可能的解析错误

```typescript
try {
    const geojson = await kmlToGeoJSON('https://example.com/data.kml');
    console.log(geojson);
} catch (error) {
    console.error('转换失败:', error);
}
```

---

## License

MIT
