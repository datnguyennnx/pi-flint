import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerPiFlintSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
