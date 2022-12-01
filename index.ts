import { effect, ref } from "https://esm.sh/@vue/reactivity@3.2.45";

const ms = ref(sessionStorage.getItem("ms") == "true");
const msCheckbox = document.getElementById("ms-checkbox") as HTMLInputElement;
msCheckbox.checked = ms.value;
msCheckbox.addEventListener("click", () => {
  ms.value = msCheckbox.checked;
});
effect(() => sessionStorage.setItem("ms", String(ms.value)));
effect(() => document.getElementById("tech-recipes")?.classList.toggle("ms", ms.value));
