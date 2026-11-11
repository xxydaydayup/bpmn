import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElLoading } from 'element-plus'
import 'element-plus/dist/index.css'
import '@/styles/tokens.css'
import '@/styles/main.css'
import App from './App.vue'
import router from './router'

createApp(App).directive('loading', ElLoading.directive).use(createPinia()).use(router).mount('#app')
