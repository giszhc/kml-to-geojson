import {defineConfig} from 'vite'

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            name: 'KmlToGeoJSON',
            fileName: 'kml-to-geojson',
            formats: ['es']
        }
    }
})
