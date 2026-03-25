import {defineConfig} from 'vite'

export default defineConfig({
    build: {
        outDir: 'docs',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: 'index.html'
            }
        },
        // 使用相对路径
        assetsDir: 'assets',
        // 确保 CSS 和 JS 使用相对路径
        cssCodeSplit: false
    },
    publicDir: 'public',
    // 基础路径设置为 ./
    base: './'
})
