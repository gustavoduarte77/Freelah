import {
  createJobsListController,
  createResourceController,
  type Category,
  type JobDetail,
  type JobsListParams,
  type JobsListState,
  type ResourceController,
  type ResourceState,
} from "@freelah/shared";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { jobsApi } from "./jobsApi";

interface Observable<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
}

function useObservable<S>(source: Observable<S>): S {
  return useSyncExternalStore(source.subscribe, source.getState, source.getState);
}

/** Categorias ativas (PRD 12). Uma consulta por tela, com carregando, erro e tentar de novo. */
export function useCategories(): { state: ResourceState<Category[]>; retry: () => void } {
  const [controller] = useState(() =>
    createResourceController<Category[]>(() => jobsApi.listCategories()),
  );
  useEffect(() => controller.load(), [controller]);
  return { state: useObservable(controller), retry: controller.retry };
}

/** Detalhe de uma oportunidade; muda de controlador quando o id muda. */
export function useJobDetail(id: string): { state: ResourceState<JobDetail>; retry: () => void } {
  const controller: ResourceController<JobDetail> = useMemo(
    () => createResourceController<JobDetail>(() => jobsApi.getJob(id)),
    [id],
  );
  useEffect(() => controller.load(), [controller]);
  return { state: useObservable(controller), retry: controller.retry };
}

/**
 * Lista paginada. Os filtros chegam já estáveis (o chamador faz o debounce); o controlador
 * descarta respostas antigas e não repete requisições para filtros iguais. `null` significa
 * "filtros inválidos": nada é consultado e o estado anterior fica como está (a tela decide o que
 * mostrar no lugar).
 */
export function useJobsList(params: JobsListParams | null): {
  state: JobsListState;
  loadMore: () => void;
  retry: () => void;
  refresh: () => void;
} {
  const [controller] = useState(() => createJobsListController({ api: jobsApi }));
  const key = JSON.stringify(params);
  useEffect(() => {
    const current: JobsListParams | null = JSON.parse(key);
    if (current) controller.setParams(current);
  }, [controller, key]);
  return {
    state: useObservable(controller),
    loadMore: controller.loadMore,
    retry: controller.retry,
    refresh: controller.refresh,
  };
}
