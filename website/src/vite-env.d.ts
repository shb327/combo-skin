/// <reference types="vite/client" />

declare module 'swiper/css' {}
declare module 'swiper/css/bundle' {}
declare module 'swiper/css/navigation' {}
declare module 'swiper/css/pagination' {}
declare module 'swiper/css/scrollbar' {}
declare module 'swiper/css/autoplay' {}
declare module 'swiper/css/controller' {}

interface ImportMetaEnv {
  /** The API origin, checked and defaulted by vite.config.ts. */
  readonly VITE_API_BASE_URL: string
  /** Our image bucket's base URL (screenshots and catalog pictures), checked and defaulted by
   * vite.config.ts. */
  readonly VITE_IMAGE_BASE_URL: string
  /** The 3D viewer's origin, checked and defaulted by vite.config.ts. */
  readonly VITE_VIEWER_ORIGIN: string
}
