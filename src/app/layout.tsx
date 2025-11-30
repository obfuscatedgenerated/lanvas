import type { Metadata } from "next";
import {Merriweather_Sans, Playpen_Sans} from "next/font/google";
import "./globals.css";

import Header from "@/components/Header";

const font_sans = Merriweather_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const font_doodle = Playpen_Sans({
    variable: "--font-doodle",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: `LANvas${process.env.NEXT_PUBLIC_LAN_NUMBER ? ` ${process.env.NEXT_PUBLIC_LAN_NUMBER}` : ""}`,
    description: "",
    metadataBase: new URL("https://lanvas.ollieg.codes")
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${font_sans.variable} ${font_doodle.variable} select-none antialiased h-screen max-h-screen overflow-hidden flex flex-col`}
      >
        <Header />
        {children}
      </body>
    </html>
  );
}
