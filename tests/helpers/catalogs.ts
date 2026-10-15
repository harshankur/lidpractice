import ar from "../../src/locales/ar.json";
import hi from "../../src/locales/hi.json";
import es from "../../src/locales/es.json";
import tr from "../../src/locales/tr.json";
import uk from "../../src/locales/uk.json";
import { registerCatalog } from "../../src/i18n";

/** Makes the messages of every language available to an interface object that a test makes by itself. The app fetches them when it needs them. */
export function registerAllCatalogs(): void
{
    registerCatalog("ar", ar);
    registerCatalog("uk", uk);
    registerCatalog("tr", tr);
    registerCatalog("es", es);
    registerCatalog("hi", hi);
}
