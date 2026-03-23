import "./globals.css";

export const metadata = {
  title: "Automated Structural Mapping | UG Drone Digital Twin™",
  description: "AI-powered structural mapping of underground mine point cloud data. Detect discontinuity planes, classify structural sets, and generate mining intelligence insights.",
  keywords: "underground mining, structural mapping, point cloud, discontinuity, drone, LiDAR, RANSAC, 3D visualization",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

