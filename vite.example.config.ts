import {defineConfig} from 'vite'

export default defineConfig({
    build: {
        outDir: 'example',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: 'index.html'
            }
        }
    },
    publicDir: 'public'
})
