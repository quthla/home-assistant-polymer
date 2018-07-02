import '@polymer/app-layout/app-header-layout/app-header-layout.js';
import '@polymer/app-layout/app-header/app-header.js';
import '@polymer/app-layout/app-toolbar/app-toolbar.js';
import '@polymer/app-route/app-route.js';
import '@polymer/paper-dialog/paper-dialog.js';
import '@polymer/paper-icon-button/paper-icon-button.js';
import '@polymer/paper-tabs/paper-tab.js';
import '@polymer/paper-tabs/paper-tabs.js';
import '@polymer/iron-icon/iron-icon.js';

import { html } from '@polymer/polymer/lib/utils/html-tag.js';
import { PolymerElement } from '@polymer/polymer/polymer-element.js';

import computeStateName from '../../common/entity/compute_state_name.js';
import scrollToTarget from '../../common/dom/scroll-to-target.js';

import EventsMixin from '../../mixins/events-mixin.js';
import NavigateMixin from '../../mixins/navigate-mixin.js';

import '../../layouts/ha-app-layout.js';
import '../../components/ha-start-voice-button.js';
import { loadModule, loadJS } from '../../common/dom/load_resource.js';
import './hui-view.js';

import createCardElement from './common/create-card-element.js';

// JS should only be imported once. Modules and HTML are safe.
const JS_CACHE = {};

class HUIRoot extends NavigateMixin(EventsMixin(PolymerElement)) {
  static get template() {
    return html`
    <style include='ha-style'>
      :host {
        -ms-user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
      }

      ha-app-layout {
        min-height: 100%;
      }
      paper-tabs {
        margin-left: 12px;
        --paper-tabs-selection-bar-color: var(--text-primary-color, #FFF);
        text-transform: uppercase;
      }
      app-toolbar a {
        color: var(--text-primary-color, white);
      }
      paper-dialog {
        padding: 16px
      }
      paper-dialog span {
        color: var(--secondary-text-color);
      }
      paper-dialog paper-icon-button {
        color: var(--paper-item-icon-color);
      }
    </style>
    <app-route route="[[route]]" pattern="/:view" data="{{routeData}}"></app-route>
    <ha-app-layout id="layout">
      <app-header slot="header" fixed>
        <app-toolbar>
          <ha-menu-button narrow='[[narrow]]' show-menu='[[showMenu]]'></ha-menu-button>
          <div main-title>[[_computeTitle(config)]]</div>
          <template is="dom-if" if="[[_showNewEntitiesButton(_newEntities)]]">
            <paper-icon-button
              on-click="_showNewEntities"
              title="New entities"
              icon="hass:new-box"
            ></paper-icon-button>
          </template>
          <a href='https://developers.home-assistant.io/docs/en/lovelace_index.html' tabindex='-1' target='_blank'>
            <paper-icon-button icon='hass:help-circle-outline'></paper-icon-button>
          </a>
          <paper-icon-button icon='hass:refresh' on-click='_handleRefresh'></paper-icon-button>
          <ha-start-voice-button hass="[[hass]]"></ha-start-voice-button>
        </app-toolbar>

        <div sticky hidden$="[[_computeTabsHidden(config.views)]]">
          <paper-tabs scrollable selected="[[_curView]]" on-iron-activate="_handleViewSelected">
            <template is="dom-repeat" items="[[config.views]]">
              <paper-tab>
                <template is="dom-if" if="[[item.icon]]">
                  <iron-icon title$="[[item.title]]" icon="[[item.icon]]"></iron-icon>
                </template>
                <template is="dom-if" if="[[!item.icon]]">
                  [[_computeTabTitle(item.title)]]
                </template>
              </paper-tab>
            </template>
          </paper-tabs>
        </div>
      </app-header>

      <span id='view'></span>
    </app-header-layout>

    <paper-dialog id="dialog">
      <template is="dom-repeat" items="[[_newEntities]]" sort="_sortAbc">
        <div>
          <paper-icon-button
            on-click="_copyEntityId"
            icon="hass:content-copy"
            title="Copy entity id"
          ></paper-icon-button>
          [[_computeName(item)]]: <span>[[item]]</span
        </div>
      </template>
    </paper-dialog>
    `;
  }

  static get properties() {
    return {
      narrow: Boolean,
      showMenu: Boolean,
      hass: {
        type: Object,
        observer: '_hassChanged',
      },
      config: {
        type: Object,
        observer: '_configChanged',
      },
      columns: {
        type: Number,
        observer: '_columnsChanged',
      },

      _curView: {
        type: Number,
        value: 0,
      },

      route: {
        type: Object,
        observer: '_routeChanged'
      },
      routeData: Object,
      _newEntities: {
        type: Array,
        computed: '_computeNewEntities(hass.states, config)'
      }
    };
  }

  _routeChanged(route) {
    const views = this.config && this.config.views;
    if (route.path === '' && route.prefix === '/lovelace' && views) {
      this.navigate(`/lovelace/${views[0].id || 0}`, true);
    } else if (this.routeData.view) {
      const view = this.routeData.view;
      let index = 0;
      for (let i = 0; i < views.length; i++) {
        if (views[i].id === view || i === parseInt(view)) {
          index = i;
          break;
        }
      }
      if (index !== this._curView) this._selectView(index);
    }
  }

  _computeViewId(id, index) {
    return id || index;
  }

  _computeTitle(config) {
    return config.title || 'Home Assistant';
  }

  _computeTabsHidden(views) {
    return views.length < 2;
  }

  _computeTabTitle(title) {
    return title || 'Unnamed view';
  }

  _handleRefresh() {
    this.fire('config-refresh');
  }

  _handleViewSelected(ev) {
    const index = ev.detail.selected;
    if (index !== this._curView) {
      const id = this.config.views[index].id || index;
      this.navigate(`/lovelace/${id}`);
    }
    scrollToTarget(this, this.$.layout.header.scrollTarget);
  }

  _selectView(viewIndex) {
    this._curView = viewIndex;

    // Recreate a new element to clear the applied themes.
    const root = this.$.view;
    if (root.lastChild) {
      root.removeChild(root.lastChild);
    }

    const viewConfig = this.config.views[this._curView];

    let view;

    if (viewConfig.panel) {
      view = createCardElement(viewConfig.cards[0]);
    } else {
      view = document.createElement('hui-view');
      view.config = viewConfig;
      view.columns = this.columns;
    }

    view.hass = this.hass;
    root.appendChild(view);
  }

  _hassChanged(hass) {
    if (!this.$.view.lastChild) return;
    this.$.view.lastChild.hass = hass;
  }

  _configChanged(config) {
    this._loadResources(config.resources || []);
    // On config change, recreate the view from scratch.
    this._selectView(this._curView);
  }

  _columnsChanged(columns) {
    if (!this.$.view.lastChild) return;
    this.$.view.lastChild.columns = columns;
  }

  _loadResources(resources) {
    resources.forEach((resource) => {
      switch (resource.type) {
        case 'js':
          if (resource.url in JS_CACHE) break;
          JS_CACHE[resource.url] = loadJS(resource.url);
          break;

        case 'module':
          loadModule(resource.url);
          break;

        case 'html':
          import(/* webpackChunkName: "import-href-polyfill" */ '../../resources/html-import/import-href.js')
            .then(({ importHref }) => importHref(resource.url));
          break;

        default:
          // eslint-disable-next-line
          console.warn('Unknown resource type specified: ${resource.type}');
      }
    });
  }

  _showNewEntitiesButton(list) {
    return list.length;
  }

  _computeNewEntities(states, config) {
    const EXCLUDED_DOMAINS = [
      'group',
      'zone'
    ];

    const lovelaceEntities = this._computeLovelaceEntities(config);
    return Object.keys(states).filter(entity => !lovelaceEntities.includes(entity) &&
      !(config.excluded_entities && config.excluded_entities.includes(entity)) &&
      !EXCLUDED_DOMAINS.includes(entity.split('.', 1)[0]));
  }

  _computeLovelaceEntities(config) {
    const entities = new Set();

    function getEntityId(entity) {
      entities.add(typeof entity === 'string' ? entity : entity.entity);
    }

    function getEntities(card) {
      if (card.entity) getEntityId(card.entity);
      if (card.entities) card.entities.forEach(entity => getEntityId(entity));
      if (card.card) getEntities(card.card);
      if (card.cards) card.cards.forEach(c => getEntities(c));
    }

    config.views.forEach(view => getEntities(view));
    return Array.from(entities);
  }

  _sortAbc(a, b) {
    return a > b ? 1 : -1;
  }

  _copyEntityId(ev) {
    alert(ev.model.item);
  }

  _computeName(item) {
    return computeStateName(this.hass.states[item]);
  }

  _showNewEntities() {
    this.$.dialog.open();
  }
}

customElements.define('hui-root', HUIRoot);
