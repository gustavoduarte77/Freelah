import {
  type Category,
  type JobDetail,
  type JobsListParams,
  type JobsListState,
  type ResourceState,
} from "@freelah/shared";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLiveRefresh } from "../../lib/liveRefresh";
import {
  categoriesController,
  detailController,
  exploreJobsController,
  homeJobsController,
} from "./registry";

interface Observable<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
}

function useObservable<S>(source: Observable<S>): S {
  return useSyncExternalStore(source.subscribe, source.getState, source.getState);
}

/** Categorias ativas (PRD 12), compartilhadas por todas as telas. */
export function useCategories(): { state: ResourceState<Category[]>; retry: () => void } {
  useEffect(() => categoriesController.load(), []);
  return { state: useObservable(categoriesController), retry: categoriesController.retry };
}

/** Detalhe de uma oportunidade; muda de controlador quando o id muda. */
export function useJobDetail(id: string): { state: ResourceState<JobDetail>; retry: () => void } {
  const [epoch, setEpoch] = useState(0);
  useLiveRefresh(() => setEpoch((value) => value + 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- epoch força um controlador novo quando o cache foi descartado
  const controller = useMemo(() => detailController(id), [id, epoch]);
  useEffect(() => controller.load(), [controller]);
  return { state: useObservable(controller), retry: controller.retry };
}

/**
 * Lista de uma tela ("home" ou "explore"). `params: null` significa "filtros inválidos": nada é
 * consultado e o estado anterior fica como está (a tela decide o que mostrar no lugar).
 */
export function useJobsList(
  scope: "home" | "explore",
  params: JobsListParams | null,
): {
  state: JobsListState;
  loadMore: () => void;
  retry: () => void;
  refresh: () => void;
} {
  const controller = scope === "home" ? homeJobsController : exploreJobsController;
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
