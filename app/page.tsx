import { Chat } from "@/components/Chat";
import { SidePanel } from "@/components/SidePanel";
import { StoreProvider } from "@/lib/store";

export default function Home() {
  return (
    <StoreProvider>
      <main className="grid grid-cols-1 lg:h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:overflow-hidden">
        <Chat />
        <SidePanel />
      </main>
    </StoreProvider>
  );
}
