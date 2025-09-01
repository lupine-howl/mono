// @loki/personas/ui/bundle.js
import { html } from "lit";
import { PersonasController } from "../shared/lib/PersonasController.js";
// side-effect: ensure elements are defined
import "./persona-list.js";
import "./persona-viewer.js";
import "./persona-selector.js";

export function createPlugin({ hub } = {}) {
  const ns = "personas";
  const controller = new PersonasController({ hub });

  // items close over `personas`, so you don't need to pass it every time.
  const components = {
    body: [
      {
        id: `${ns}:viewer`,
        label: "🧠 Persona",
        order: 10,
        render: ({ controllers }) =>
          html`<persona-viewer .controller=${controller}></persona-viewer>`,
      },
      {
        id: `${ns}:list`,
        label: "👥 Personas",
        order: 20,
        render: ({ controllers }) =>
          html`<persona-list .controller=${controller}></persona-list>`,
      },
    ],
    sidebar: [
      {
        id: "personas:selector",
        label: "🧠 Persona",
        order: 10,
        render: ({ controllers }) =>
          html`<persona-selector .controller=${controller}></persona-selector>`,
      },
      {
        id: "personas:all",
        label: "👥 Personas",
        order: 20,
        render: ({ controllers }) =>
          html`<persona-list .controller=${controller}></persona-list>`,
      },
    ],
  };

  // return a tidy bundle
  return {
    controllers: { [ns]: controller },
    components,
    async ready() {
      await controller.ready?.();
    },
    dispose() {
      controller.dispose?.();
    },
  };
}
