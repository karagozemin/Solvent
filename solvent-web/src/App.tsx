import { useEffect, useState } from "react";
import "./App.css";
import { Landing } from "./Landing";
import { Console } from "./Console";
import { silentAddress, loadWallet } from "./solvent";

export default function App() {
  const [view, setView] = useState<"home" | "console">("home");
  const [address, setAddress] = useState<string | null>(null);

  // Silent reconnect on load — restore a Freighter session without a popup.
  useEffect(() => {
    if (!loadWallet()) return;
    silentAddress().then((a) => a && setAddress(a));
  }, []);

  return view === "home" ? (
    <Landing onEnter={() => setView("console")} />
  ) : (
    <Console
      address={address}
      setAddress={setAddress}
      onExit={() => setView("home")}
    />
  );
}
