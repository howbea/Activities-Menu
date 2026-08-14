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
//import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import {AppMenu} from './appMenu.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

const INACTIVE_WORKSPACE_DOT_SCALE = 0.75;

const ANIMATION_TIME = 100;
const DISPLAY_TIMEOUT = 600;

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
        
        this.add_style_class_name('gwork-space');

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


export const WorkspaceSwitcherPopup = GObject.registerClass(
class WorkspaceSwitcherPopup extends Clutter.Actor {
    _init() {
        super._init({
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });

        const constraint = new Layout.MonitorConstraint({
            primary: true,
        });

        this.add_constraint(constraint);

        Main.uiGroup.add_child(this);

        this._timeoutId = 0;
        
        this._list = new St.BoxLayout({
            style_class: 'workspace-switcher',
        });
        this.add_child(this._list);

        // GNOME風workspace indicator
        this._indicators =
            new WorkspaceIndicators();

        this._list.add_child(this._indicators);

        this.hide();

        this.connect('destroy', this._onDestroy.bind(this));
    }


    display(activeWorkspaceIndex) {
        this._activeWorkspaceIndex = activeWorkspaceIndex;

        //this._redisplay();
        if (this._timeoutId !== 0)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DISPLAY_TIMEOUT, this._onTimeout.bind(this));
        GLib.Source.set_name_by_id(this._timeoutId, '[gnome-shell] this._onTimeout');

        const duration = this.visible ? 0 : ANIMATION_TIME;
        this.show();
        this.opacity = 0;
        this.ease({
            opacity: 255,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _onTimeout() {
        GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
        this.ease({
            opacity: 0.0,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.hide(), //destroy(),
        });
        return GLib.SOURCE_REMOVE;
    }

    _onDestroy() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
    }
});

var AggregateLayout = GObject.registerClass(
class AggregateLayout extends Clutter.BoxLayout {
    _init(params = {}) {
        params['orientation'] = Clutter.Orientation.VERTICAL;
        super._init(params);

        this._sizeChildren = [];
    }

    addSizeChild(actor) {
        this._sizeChildren.push(actor);
        this.layout_changed();
    }

    vfunc_get_preferred_width(container, forHeight) {
        let themeNode = container.get_theme_node();
        let minWidth = themeNode.get_min_width();
        let natWidth = minWidth;

        for (let i = 0; i < this._sizeChildren.length; i++) {
            let child = this._sizeChildren[i];
            let [childMin, childNat] = child.get_preferred_width(forHeight);
            minWidth = Math.max(minWidth, childMin);
            natWidth = Math.max(natWidth, childNat);
        }
        return [minWidth, natWidth];
    }
});

const AppSubMenuItem = GObject.registerClass({
    Signals: {'changed': {}},
}, class AppSubMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    _init() {
        super._init('', false); //true);
        
        //this.icon.icon_name = 'application-x-executable-symbolic';
        this.add_style_class_name('app-menu');

        this._startingApps = [];
        this._targetApp = null;
        
        this.visible = false;

        /*this._appMenu = new AppMenu(this, St.Side.TOP, {
            favoritesSection: false,
            showSingleWindows: true,
        });*/
        
        this._appMenu = new AppMenu(this.menu, this, {
            favoritesSection: false,
            showSingleWindows: true,
        });

        // AppMenuに現在のアプリを設定
        this._appMenu.setApp(null);

        // AppMenuの中身をサブメニューとして使う
        //this.menu = this._appMenu;

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
        const tracker = Shell.WindowTracker.get_default();

        if (!tracker.focus_app && global.stage.key_focus)
            return;

        this._sync();
    }

    _onAppStateChanged(appSys, app) {
        if (app.state === Shell.AppState.STARTING)
            this._startingApps.push(app);
        else
            this._startingApps =
                this._startingApps.filter(a => a !== app);

        this._sync();
    }

    _findTargetApp() {
        const workspace = global.workspace_manager.get_active_workspace();
        const tracker = Shell.WindowTracker.get_default();

        if (tracker.focus_app?.is_on_workspace(workspace))
            return tracker.focus_app;

        for (const app of this._startingApps) {
            if (app.is_on_workspace(workspace))
                return app;
        }
        
        return null;
    }

    _sync() {
        const app = this._findTargetApp();

        if (this._targetApp === app)
            return;

        this._targetApp?.disconnectObject(this);
        this._targetApp = app;

        if (app) {
            app.connectObject(
                'notify::busy',
                this._sync.bind(this),
                this
            );

            this.label.text = app.get_name();
            this.set_accessible_name(app.get_name());
            //this.icon.gicon = app.get_icon();
            this.visible = true;
        } else {
            //this.label.text = _('Application');
            this.visible = false;
        }

        this._appMenu.setApp(app);

        this.visible = app !== null;
        this.emit('changed');
    }
});

const ForceQuitMenuItem = GObject.registerClass(
class ForceQuitMenuItem extends PopupMenu.PopupMenuItem {
    _init() {
        super._init(_('Request Quit'));

        this._targetApp = null;

        Shell.WindowTracker.get_default().connectObject(
            'notify::focus-app',
            this._sync.bind(this),
            this
        );

        this.connect('activate', () => {
            this._targetApp?.request_quit();
        });

        this._sync();
    }

    _sync() {
        const app = Shell.WindowTracker.get_default().focus_app;

        this._targetApp = app;

        if (app) {
            this.label.text = `Quit ${app.get_name()}`;
            this.visible = true;
        } else {
            this.visible = false;
        }
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
        
        this.menu.actor.add_style_class_name('main-menu');
        
        let menuLayout = new AggregateLayout();
        this.menu.box.set_layout_manager(menuLayout);
        
        this._container = new St.BoxLayout({reactive: true, style_class: 'activities-cont'});
        this.add_child(this._container);
        
        this._iconBox = new St.Bin({
        y_align: Clutter.ActorAlign.CENTER,
        });         
        this._container.add_child(this._iconBox);
        
        const icon = new St.Icon({
            icon_name: 'debian-logo-symbolic',
            style_class: 'activities-icon',
        });
        //this._iconBox.set_child(icon);
        
        this._label = new St.Label({
            //text: _('Activities'),
            text: "\uE001",
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'activities-label',
        });        
        this._container.add_child(this._label);
        //this._container.add_child(new WorkspaceIndicators());

        Main.overview.connectObject('showing',
            () => this.add_style_pseudo_class('checked'),
            this);
        Main.overview.connectObject('hiding',
            () => this.remove_style_pseudo_class('checked'),
            this);

        this._xdndTimeOut = 0;

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
        
        let itemappearance = new PopupMenu.PopupMenuItem(_('Change Background…'));
        itemappearance.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-appearance-panel.desktop').activate();
        });
        
        let itemdisplay = new PopupMenu.PopupMenuItem(_('Display Settings'));
        itemdisplay.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-display-panel.desktop').activate();
        });
        
        let itemsharing = new PopupMenu.PopupMenuItem(_('Sharing…'));
        itemsharing.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-sharing-panel.desktop').activate();
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
        




    
    this.menu.addMenuItem(itemabout);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    
    //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      
    this.menu.addMenuItem(itemsystem);
    this.menu.addMenuItem(itemsoftware);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    /*this._focusAppHeader = new PopupMenu.PopupSeparatorMenuItem(_('Application'));
    this._appSubMenuItem = new AppSubMenuItem();
    this.menu.addMenuItem(this._focusAppHeader);
    this.menu.addMenuItem(this._appSubMenuItem);
    this._focusAppHeader.visible = this._appSubMenuItem.visible;
    this._appSubMenuItem.connect('changed', () => {
        this._focusAppHeader.visible = this._appSubMenuItem.visible;
    });*/
   this.smappsitem = new PopupMenu.PopupSubMenuMenuItem(
    _('Recent Items'),
    false,
    {style_class: 'smapps-item'}
);
this.submenubuild();
this.menu.addMenuItem(this.smappsitem);

this.smappsitem.menu.connect('open-state-changed', (menu, open) => {
    if (open) {
        this.smappsitem.menu.removeAll();
        this.submenubuild();
    }
});

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this._QuitMenuItem = new ForceQuitMenuItem();
    this.menu.addMenuItem(this._QuitMenuItem);
    
    //this.menu.addMenuItem(itemmultitasking);
    //this.menu.addMenuItem(itembackground);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
     
        
    this.menu.addMenuItem(itemhelp);

    }
    
    add_item(app) {
        const space_widget = new St.Widget({style_class: 'space-widget'});
        let item = new PopupMenu.PopupMenuItem('', {style_class: 'items-item'}); //BaseMenuItem;
        this.smappsitem.menu.addMenuItem(item);
        //let box = new St.BoxLayout({vertical: false, style_class: 'items-box'});
        //item.actor.add_child(box);
        let icon = app.create_icon_texture(16);
        item.insert_child_at_index(icon, 0);
        item.insert_child_at_index(space_widget, 0);
        //box.add_child(icon);
        let label = new St.Label({text: app.get_name(),
                                  y_align: Clutter.ActorAlign.CENTER,});
        //box.add_child(label);
        item.label.text = app.get_name();
        
        item.connect("activate", () => {
            app.open_new_window(-1);
            //Main.overview.hide();
            });
    }
    
    submenubuild() {
    const space_widget = new St.Widget({style_class: 'space-widget'});
    let count = 0;
        Shell.AppUsage.get_default().get_most_used().forEach((app) => {
            if (count < 5) {
            this.add_item(app);
            count++;
            }
        });
        
        const separator = new PopupMenu.PopupMenuItem('Applications', {style_class:'items-sitem', reactive: false});
        const separator2 = new PopupMenu.PopupMenuItem('Documents', {style_class:'items-sitem', reactive: false});
        
        separator.insert_child_at_index(space_widget, 0);
        separator2.insert_child_at_index(space_widget, 0);
        
        this.smappsitem.menu.addMenuItem(separator, 0);
        this.smappsitem.menu.addMenuItem(separator2);
        
        const MAX_ITEMS = 5; //this._settings.get_int('max-items'); // ← gsettings から取得

    const bookmark = new GLib.BookmarkFile();
    const xbelPath = GLib.build_filenamev([
        GLib.get_home_dir(),
        '.local/share/recently-used.xbel'
    ]);

    try {
        bookmark.load_from_file(xbelPath);

        const items = bookmark.get_uris();

        if (items.length === 0) {
            this.smappsitem.menu.addMenuItem(
                new PopupMenu.PopupMenuItem("No recent files", { reactive: false, style_class: 'items-item'})
            );
            return;
        }

        // 最新順に並び替え
        const sorted = items.sort((a, b) => {
            const ta = bookmark.get_modified(a);
            const tb = bookmark.get_modified(b);
            return tb - ta;
        });

        // ★ 表示用に最大 MAX_ITEMS 件集める
        const filteredItems = [];

        for (const uri of sorted) {
            if (filteredItems.length >= MAX_ITEMS)
                break;

            const file = Gio.File.new_for_uri(uri);

            // 1) ファイルがない → スキップ
            if (!file.query_exists(null)) {
                continue;
            }

            // 2) ディレクトリ → スキップ
            const infoBasic = file.query_info(
                'standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            if (infoBasic.get_file_type() === Gio.FileType.DIRECTORY) {
                continue;
            }

            filteredItems.push(uri);
        }

        // ★ 表示
        if (filteredItems.length === 0) {
            this.smappsitem.menu.addMenuItem(
                new PopupMenu.PopupMenuItem("No recent files", { reactive: false, style_class: 'items-item'})
            );
            return;
        }

        for (const uri of filteredItems) {
            const file = Gio.File.new_for_uri(uri);

            const info = file.query_info(
                'standard::icon,standard::display-name',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            const gicon = info.get_icon();
            const displayName = info.get_display_name();

            const item = new PopupMenu.PopupMenuItem('', {style_class: 'items-item'});

            const icon = new St.Icon({
                gicon,
                icon_size: 16,
                //style_class: 'popup-menu-icon'
            });
            
            const space_widget = new St.Widget({style_class: 'space-widget'});
            item.insert_child_at_index(icon, 0);
            item.insert_child_at_index(space_widget, 0);
            item.label.text = displayName;            

            item.connect('activate', () => {

    // ★ XBEL のパス
    const xbelPath = GLib.build_filenamev([
        GLib.get_home_dir(),
        '.local/share/recently-used.xbel'
    ]);

    try {
        const bookmark2 = new GLib.BookmarkFile();
        bookmark2.load_from_file(xbelPath);

        // ★ now を UNIX タイムスタンプ（秒）で取得
        //const now = Math.floor(Date.now() / 1000);

        // ★ タイムスタンプ更新
        //bookmark2.set_modified(uri, now);

        // ★ 保存
        //bookmark2.to_file(xbelPath);

    } catch (e) {
        log(`XBEL update error: ${e}`);
    }

    // ★ 最後にファイルを開く
    Gio.AppInfo.launch_default_for_uri(uri, null);
});
            
            this.smappsitem.menu.addMenuItem(item);
        }

    } catch (e) {
        //this.smappsitem._indicator.menu.addMenuItem(
        this.smappsitem.menu.addMenuItem(
            new PopupMenu.PopupMenuItem(`Error: ${e}`, { reactive: false })
        );
    }
    
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
            return Clutter.EVENT_STOP;
            //return Clutter.EVENT_PROPAGATE;
        }
        //return Clutter.EVENT_PROPAGATE;
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
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'left');
        if (Main.wm._workspaceSwitcherPopup)
        Main.wm._workspaceSwitcherPopup.destroy();
        
        Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup();
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        if (Main.panel.statusArea['activities']) {
        if (Main.sessionMode.currentMode !== 'unlock-dialog')
            Main.panel.statusArea['activities'].show();}
    }
}
