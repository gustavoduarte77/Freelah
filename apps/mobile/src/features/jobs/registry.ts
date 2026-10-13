import {
  attachToRecovery,
  createJobsListController,
  createResourceController,
  type Category,
  type JobDetail,
  type ResourceController,
} from "@freelah/shared";
import { fetchHealth } from "../../lib/api";
import { onJobsInvalidated } from "../../lib/liveRefresh";
import { recovery } from "../recovery/coordinator";
import { jobsApi } from "./jobsApi";

// Controladores únicos do app: sobrevivem às telas, então o que já foi carregado continua na tela
// ao voltar (e é atualizado em segundo plano) e uma falha de conexão não apaga a lista. Todos
// estão ligados ao mesmo coordenador de recuperação.

export const categoriesController = createResourceController<Category[]>(() => jobsApi.listCategories());
attachToRecovery(recovery, categoriesController);

export const healthController = createResourceController(() => fetchHealth());
attachToRecovery(recovery, healthController);

/** Oportunidades recentes da Home. */
export const homeJobsController = createJobsListController({ api: jobsApi, initialParams: { limit: 4 } });
attachToRecovery(recovery, homeJobsController);

/** Lista de Explorar (busca, categoria e filtros). */
export const exploreJobsController = createJobsListController({ api: jobsApi });
attachToRecovery(recovery, exploreJobsController);

const MAX_DETAILS = 30;
const details = new Map<string, { controller: ResourceController<JobDetail>; detach: () => void }>();

/** Um controlador por oportunidade aberta; os mais antigos são descartados. */
export function detailController(id: string): ResourceController<JobDetail> {
  const existing = details.get(id);
  if (existing) {
    details.delete(id); // renova a posição
    details.set(id, existing);
    return existing.controller;
  }
  const controller = createResourceController<JobDetail>(() => jobsApi.getJob(id));
  const detach = attachToRecovery(recovery, controller);
  details.set(id, { controller, detach });
  if (details.size > MAX_DETAILS) {
    const oldest = details.keys().next().value;
    if (oldest !== undefined) {
      details.get(oldest)?.detach();
      details.delete(oldest);
    }
  }
  return controller;
}

// Se o estado de uma vaga mudou por fora (hoje, só no Modo Demonstração), os detalhes em cache
// são descartados e as listas se atualizam em segundo plano, sem esperar a validade do cache.
onJobsInvalidated(() => {
  details.forEach((entry) => entry.detach());
  details.clear();
  homeJobsController.refresh();
  exploreJobsController.refresh();
});
