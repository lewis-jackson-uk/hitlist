import type { MetadataRoute } from "next";

/** Lets HitList be added to a phone's home screen and open like an app, straight to your list. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HitList",
    short_name: "HitList",
    description: "Who you need to hit up next.",
    start_url: "/live",
    scope: "/",
    display: "standalone",
    background_color: "#eef1f4",
    theme_color: "#eef1f4",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
