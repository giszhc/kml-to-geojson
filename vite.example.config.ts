import {defineConfig} from 'vite'

export default defineConfig({
    build: {
        outDir: 'docs',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: 'index.html'
            }
        }
    },
    publicDir: 'public'
})
