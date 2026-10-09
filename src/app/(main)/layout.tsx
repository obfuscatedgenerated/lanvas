import Header from "@/components/Header";
import ConnectionOverlay from "@/components/ConnectionOverlay";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <ConnectionOverlay />
      {children}
    </>
  );
}
