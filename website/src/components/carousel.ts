/** Settings for carousels inside links. They never swipe, so Swiper's click blocking has
 * nothing to protect: with it on, a press whose pointer moves even 1 px (as trackpad presses
 * often do) has its click cancelled, and the link does not navigate. */
export const LINK_CAROUSEL = {
  allowTouchMove: false,
  preventClicks: false,
  preventClicksPropagation: false,
} as const
