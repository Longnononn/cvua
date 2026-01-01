import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  console.warn("Unhandled promise rejected:", event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
