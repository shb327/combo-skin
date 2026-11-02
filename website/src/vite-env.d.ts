/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASSET_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'swiper/css' {}
declare module 'swiper/css/bundle' {}
declare module 'swiper/css/navigation' {}
declare module 'swiper/css/pagination' {}
declare module 'swiper/css/scrollbar' {}
declare module 'swiper/css/autoplay' {}
declare module 'swiper/css/controller' {}
