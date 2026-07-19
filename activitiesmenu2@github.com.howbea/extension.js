/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Atk from 'gi://Atk';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import AccountsService from 'gi://AccountsService';
import Graphene from 'gi://Graphene';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as userWidget from 'resource:///org/gnome/shell/ui/userWidget.js';
import * as AppFavorites from "resource:///org/gnome/shell/ui/appFavorites.js";
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';

const INACTIVE_WORKSPACE_DOT_SCALE = 0.75;

const WorkspaceDot = GObject.registerClass({
    Properties: {
        'expansion': GObject.ParamSpec.double('expansion', null, null,
            GObject.ParamFlags.READWRITE,
            0.0, 1.0, 0.0),
        'width-multiplier': GObject.ParamSpec.double(
            'width-multiplier', null, null,
            GObject.ParamFlags.READWRITE,
            1.0, 10.0, 1.0),
    },
}, class WorkspaceDot extends Clutter.Actor {
    constructor(params = {}) {
        super({
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            ...params,
        });

        this._dot = new St.Widget({
            style_class: 'workspace-dot',
            y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            request_mode: Clutter.RequestMode.WIDTH_FOR_HEIGHT,
        });
        this.add_child(this._dot);

        this.connect('notify::width-multiplier', () => this.queue_relayout());
        this.connect('notify::expansion', () => {
            this._updateVisuals();
            this.queue_relayout();
        });
        this._updateVisuals();

        this._destroying = false;
    }

    _updateVisuals() {
        const {expansion} = this;

        this._dot.set({
            opacity: Util.lerp(0.50, 1.0, expansion) * 255,
            scaleX: Util.lerp(INACTIVE_WORKSPACE_DOT_SCALE, 1.0, expansion),
            scaleY: Util.lerp(INACTIVE_WORKSPACE_DOT_SCALE, 1.0, expansion),
        });
    }

    vfunc_get_preferred_width(forHeight) {
        const factor = Util.lerp(1.0, this.widthMultiplier, this.expansion);
        return this._dot.get_preferred_width(forHeight).map(v => Math.round(v * factor));
    }

    vfunc_get_preferred_height(forWidth) {
        return this._dot.get_preferred_height(forWidth);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        box.set_origin(0, 0);
        this._dot.allocate(box);
    }

    scaleIn() {
        this.set({
            scale_x: 0,
            scale_y: 0,
        });

        this.ease({
            duration: 500,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            scale_x: 1.0,
            scale_y: 1.0,
        });
    }

    scaleOutAndDestroy() {
        this._destroying = true;

        this.ease({
            duration: 500,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            scale_x: 0.0,
            scale_y: 0.0,
            onComplete: () => this.destroy(),
        });
    }

    get destroying() {
        return this._destroying;
    }
});

const WorkspaceIndicators = GObject.registerClass(
class WorkspaceIndicators extends St.BoxLayout {
    constructor() {
        super();

        this._workspacesAdjustment = Main.createWorkspacesAdjustment(this);
        this._workspacesAdjustment.connectObject(
            'notify::value', () => this._updateExpansion(),
            'notify::upper', () => this._recalculateDots(),
            this);

        for (let i = 0; i < this._workspacesAdjustment.upper; i++)
            this.insert_child_at_index(new WorkspaceDot(), i);
        this._updateExpansion();
    }

    _getActiveIndicators() {
        return [...this].filter(i => !i.destroying);
    }

    _recalculateDots() {
        const activeIndicators = this._getActiveIndicators();
        const nIndicators = activeIndicators.length;
        const targetIndicators = this._workspacesAdjustment.upper;

        let remaining = Math.abs(nIndicators - targetIndicators);
        while (remaining--) {
            if (nIndicators < targetIndicators) {
                const indicator = new WorkspaceDot();
                this.add_child(indicator);
                indicator.scaleIn();
            } else {
                const indicator = activeIndicators[nIndicators - remaining - 1];
                indicator.scaleOutAndDestroy();
            }
        }

        this._updateExpansion();
    }

    _updateExpansion() {
        const nIndicators = this._getActiveIndicators().length;
        const activeWorkspace = this._workspacesAdjustment.value;

        let widthMultiplier;
        if (nIndicators <= 2)
            widthMultiplier = 3.625;
        else if (nIndicators <= 5)
            widthMultiplier = 3.25;
        else
            widthMultiplier = 2.75;

        this.get_children().forEach((indicator, index) => {
            const distance = Math.abs(index - activeWorkspace);
            indicator.expansion = Math.clamp(1 - distance, 0, 1);
            indicator.widthMultiplier = widthMultiplier;
        });
    }
});

const ActivitiesButton = GObject.registerClass(
class ActivitiesButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, null, false);

        this.set({
            name: 'panelActivities',
            accessible_role: Atk.Role.TOGGLE_BUTTON,
            /* Translators: If there is no suitable word for "Activities"
               in your language, you can use the word for "Overview". */
            accessible_name: _('Activities'),
            reactive: true,
            track_hover: true,
            can_focus: true,
        });
        
        this._container = new St.BoxLayout({reactive: true, style_class: 'activities-cont'});
        this.add_child(this._container);
        
        this._iconBox = new St.Bin({
        y_align: Clutter.ActorAlign.CENTER,
        });         
        //this._container.add_child(this._iconBox);
        this._label = new St.Label({
            text: _('Activities'),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'activities-label',
        });        
        this._container.add_child(this._label);
        this._container.add_child(new WorkspaceIndicators());
        
        const icon = new St.Icon({
            icon_name: 'start-here-symbolic',
            style_class: 'activities-icon',
        });
        this._iconBox.set_child(icon);

        Main.overview.connectObject('showing',
            () => this.add_style_pseudo_class('checked'),
            this);
        Main.overview.connectObject('hiding',
            () => this.remove_style_pseudo_class('checked'),
            this);

        this._xdndTimeOut = 0;
        
/*// --- scroll で workspace 切替 & popup 表示 ---
this._lastScrollTime = 0;

this.connect('scroll-event', (_, event) => {
    const now = Date.now();
    if (now - this._lastScrollTime < 200)
        return Clutter.EVENT_STOP;
    this._lastScrollTime = now;

    const wsManager = global.workspace_manager;
    let index = wsManager.get_active_workspace().index();

    // 最初に従来の方式（UP / DOWN）が使えるかチェック
    let direction = event.get_scroll_direction();
    if (direction === Clutter.ScrollDirection.DOWN) {
        index++;
    } else if (direction === Clutter.ScrollDirection.UP) {
        index--;
    } else {
        // Smooth scroll (delta) 方式の対応
        let [dx, dy] = event.get_scroll_delta();
        if (dy > 0)       // スクロール ↓
            index++;
        else if (dy < 0)  // スクロール ↑
            index--;
        else
            return Clutter.EVENT_PROPAGATE;
    }

    let nindex = Math.clamp(index, 0, wsManager.n_workspaces - 1);
    wsManager.get_workspace_by_index(nindex).activate(global.get_current_time());

    // popup 表示
    this._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
    //this._workspaceSwitcherPopup.display(nindex);

    return Clutter.EVENT_STOP;
});*/
    let item2 = new PopupMenu.PopupMenuItem(_('Applications'));
        item2.connect('activate', () => {
            if (Main.overview.dash.showAppsButton.checked) {
                if (Main.overview.shouldToggleByCornerOrButton())
                    Main.overview.dash.showAppsButton.checked = false;
            }
            else {
                if (Main.overview.shouldToggleByCornerOrButton()) {
                    Main.overview.show();
                    Main.overview.dash.showAppsButton.checked = true;
                    }
            }
        });
        
    let itemsettings = new PopupMenu.PopupMenuItem(_('Settings'));
        itemsettings.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop').activate();
        });
        
    let itembackground = new PopupMenu.PopupMenuItem(_('Change Background…'));
        itembackground.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-background-panel.desktop').activate();
        });
    
    let itemsystem = new PopupMenu.PopupMenuItem(_('System Settings…'));
        itemsystem.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-system-panel.desktop').activate();
        });
        
    let itemdisplay = new PopupMenu.PopupMenuItem(_('Display Settings'));
        itemdisplay.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-display-panel.desktop').activate();
        });
        
    let itemmultitasking = new PopupMenu.PopupMenuItem(_('Multitasking…'));
        itemmultitasking.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-multitasking-panel.desktop').activate();
        });
        
        let itemabout = new PopupMenu.PopupMenuItem(_('About'));
        itemabout.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-about-panel.desktop').activate();
        });
        
        let itemhelp = new PopupMenu.PopupMenuItem(_('Help'));
        itemhelp.connect('activate', () => {
            if (Shell.AppSystem.get_default().lookup_app('yelp.desktop')) {
                Shell.AppSystem.get_default().lookup_app('yelp.desktop').activate();
            }
            else {
            Gio.AppInfo.launch_default_for_uri_async('https://discourse.gnome.org/', global.create_app_launch_context(0, -1), null)
            }
        });
        
        let itemsoftware = new PopupMenu.PopupMenuItem(_('Software…'));
        itemsoftware.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop').activate();
        //Util.spawn(['gnome-software', '--mode=updates']);
        });
        
const AppMenuItem = GObject.registerClass(
class AppMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    _init(settings) {
        super._init(_('Application'), true);

        this._settings = settings;
        this._targetApp = null;
        this._startingApps = [];

        this._appMenu = new AppMenu(this, St.Side.TOP, {
            favoritesSection: false,
            showSingleWindows: true,
        });

        // AppMenuを中に入れる
        this.menu.addMenuItem(this._appMenu);


        Shell.WindowTracker.get_default().connectObject(
            'notify::focus-app',
            this._focusAppChanged.bind(this),
            this
        );

        Shell.AppSystem.get_default().connectObject(
            'app-state-changed',
            this._onAppStateChanged.bind(this),
            this
        );

        global.window_manager.connectObject(
            'switch-workspace',
            this._sync.bind(this),
            this
        );

        this._sync();
    }


    _focusAppChanged() {
        this._sync();
    }


    _onAppStateChanged(appSys, app) {
        if (app.state !== Shell.AppState.STARTING)
            this._startingApps =
                this._startingApps.filter(a => a !== app);
        else
            this._startingApps.push(app);

        this._sync();
    }


    _findTargetApp() {
        const workspace =
            global.workspace_manager.get_active_workspace();

        const tracker =
            Shell.WindowTracker.get_default();

        const app = tracker.focus_app;

        if (app && app.is_on_workspace(workspace))
            return app;

        return null;
    }


    _sync() {
        const app = this._findTargetApp();

        if (this._targetApp === app)
            return;


        this._targetApp = app;


        this.label.text =
            app ? app.get_name() : _('Application');


        this._appMenu.setApp(app);
    }
});
        //item.menu.addMenuItem(new AppMenu());
        

    this.menu.addMenuItem(itemabout);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    
    
    this.menu.addMenuItem(itemsystem);
    this.menu.addMenuItem(itemsoftware);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    //this.menu.addMenuItem(item2);
    //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this.menu.addMenuItem(itemhelp);
    //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());        
    
    }

    handleDragOver(source, _actor, _x, _y, _time) {
        if (source !== Main.xdndHandler)
            return DND.DragMotionResult.CONTINUE;

        if (this._xdndTimeOut !== 0)
            GLib.source_remove(this._xdndTimeOut);
        this._xdndTimeOut = GLib.timeout_add(GLib.PRIORITY_DEFAULT, BUTTON_DND_ACTIVATION_TIMEOUT, () => {
            this._xdndToggleOverview();
        });
        GLib.Source.set_name_by_id(this._xdndTimeOut, '[gnome-shell] this._xdndToggleOverview');

        return DND.DragMotionResult.CONTINUE;
    }

    vfunc_event(event) {    
        if (event.type() == Clutter.EventType.TOUCH_END ||
            event.type() == Clutter.EventType.BUTTON_RELEASE) {
            if (event.get_button() === 3)
                this.menu.toggle();
            else {
                if (Main.overview.shouldToggleByCornerOrButton())
                    Main.overview.toggle();
            }
            return Clutter.EVENT_PROPAGATE;
        }
        return Main.wm.handleWorkspaceScroll(event);
    }


    vfunc_key_release_event(event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_space) {
            if (Main.overview.shouldToggleByCornerOrButton()) {
                Main.overview.toggle();
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _xdndToggleOverview() {
        let [x, y] = global.get_pointer();
        let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

        if (pickedActor === this && Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();

        GLib.source_remove(this._xdndTimeOut);
        this._xdndTimeOut = 0;
        return GLib.SOURCE_REMOVE;
    }
});

export default class IndicatorExampleExtension extends Extension {

    enable() {
        if (Main.panel.statusArea['activities'])
            Main.panel.statusArea['activities'].hide();
        this._indicator = new ActivitiesButton();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'left');
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        if (Main.panel.statusArea['activities']) {
        if (Main.sessionMode.currentMode !== 'unlock-dialog')
            Main.panel.statusArea['activities'].show();}
    }
}
