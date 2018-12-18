import { Scope, Type } from '@nestjs/common';
import { STATIC_CONTEXT } from './constants';
import { Module } from './module';

export const INSTANCE_METADATA_SYMBOL = Symbol.for('instance_metadata:cache');

export interface ContextId {
  readonly id: number;
}

export interface InstancePerContext<T> {
  instance: T;
  isResolved?: boolean;
  isPending?: boolean;
  donePromise?: Promise<void>;
}
export interface PropertyMetadata {
  key: string;
  wrapper: InstanceWrapper;
}

interface InstanceMetadataStore {
  dependencies?: InstanceWrapper[];
  properties?: PropertyMetadata[];
  enhancers?: InstanceWrapper[];
}

export class InstanceWrapper<T = any> {
  public readonly name: any;
  public readonly metatype: Type<T>;
  public readonly inject?: (string | symbol | Function | Type<any>)[];
  public readonly async?: boolean;
  public readonly host?: Module;
  public readonly scope?: Scope = Scope.DEFAULT;
  public forwardRef?: boolean;

  private readonly values = new WeakMap<ContextId, InstancePerContext<T>>();
  private readonly [INSTANCE_METADATA_SYMBOL]: InstanceMetadataStore = {};

  constructor(
    metadata: Partial<InstanceWrapper<T>> & Partial<InstancePerContext<T>> = {},
  ) {
    this.initialize(metadata);
  }

  set instance(value: T) {
    this.values.set(STATIC_CONTEXT, { instance: value });
  }

  get instance(): T {
    const instancePerContext = this.getInstanceByContextId(STATIC_CONTEXT);
    return instancePerContext.instance;
  }

  get isNotMetatype(): boolean {
    return !this.metatype;
  }

  getInstanceByContextId(contextId: ContextId): InstancePerContext<T> {
    const instancePerContext = this.values.get(contextId);
    return instancePerContext
      ? instancePerContext
      : this.cloneStaticInstance(contextId);
  }

  setInstanceByContextId(contextId: ContextId, value: InstancePerContext<T>) {
    this.values.set(contextId, value);
  }

  addCtorMetadata(index: number, wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].dependencies) {
      this[INSTANCE_METADATA_SYMBOL].dependencies = [];
    }
    this[INSTANCE_METADATA_SYMBOL].dependencies[index] = wrapper;
  }

  getCtorMetadata(): InstanceWrapper[] {
    return this[INSTANCE_METADATA_SYMBOL].dependencies;
  }

  addPropertiesMetadata(key: string, wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].properties) {
      this[INSTANCE_METADATA_SYMBOL].properties = [];
    }
    this[INSTANCE_METADATA_SYMBOL].properties.push({
      key,
      wrapper,
    });
  }

  getPropertiesMetadata(): PropertyMetadata[] {
    return this[INSTANCE_METADATA_SYMBOL].properties;
  }

  addEnhancerMetadata(wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].enhancers) {
      this[INSTANCE_METADATA_SYMBOL].enhancers = [];
    }
    this[INSTANCE_METADATA_SYMBOL].enhancers.push(wrapper);
  }

  getEnhancersMetadata(): InstanceWrapper[] {
    return this[INSTANCE_METADATA_SYMBOL].enhancers;
  }

  isDependencyTreeStatic(): boolean {
    if (this.scope === Scope.REQUEST) {
      return false;
    }
    const { dependencies, properties, enhancers } = this[
      INSTANCE_METADATA_SYMBOL
    ];
    let isStatic =
      (dependencies && this.isWrapperStatic(dependencies)) || !dependencies;

    if (!properties || !isStatic) {
      return isStatic;
    }
    const propertiesHosts = properties.map(item => item.wrapper);
    isStatic = isStatic && this.isWrapperStatic(propertiesHosts);
    if (!enhancers || !isStatic) {
      return isStatic;
    }
    return this.isWrapperStatic(enhancers);
  }

  private isWrapperStatic(tree: InstanceWrapper[]) {
    return tree.every((item: InstanceWrapper) => item.isDependencyTreeStatic());
  }

  private initialize(
    metadata: Partial<InstanceWrapper<T>> & Partial<InstancePerContext<T>>,
  ) {
    const { instance, isResolved, ...wrapperPartial } = metadata;
    Object.assign(this, wrapperPartial);

    this.setInstanceByContextId(STATIC_CONTEXT, {
      instance,
      isResolved,
    });
  }

  private cloneStaticInstance(contextId: ContextId): InstancePerContext<T> {
    const staticInstance = this.getInstanceByContextId(STATIC_CONTEXT);
    if (this.isDependencyTreeStatic()) {
      return staticInstance;
    }
    const instancePerContext: InstancePerContext<T> = {
      ...staticInstance,
      instance: undefined,
      isResolved: false,
      isPending: false,
    };
    this.setInstanceByContextId(contextId, instancePerContext);
    return instancePerContext;
  }
}