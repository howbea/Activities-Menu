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
import * as userWidget from './userWidget.js';
import * as AppFavorites from "resource:///org/gnome/shell/ui/appFavorites.js";
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as osdWindow from './osdWindow.js';

Gio._promisify(Gio.AppInfo, 'launch_default_for_uri_async');

import {PlacesManager} from './placeDisplay.js';
const N_ = x => x;


class PlaceMenuItem extends PopupMenu.PopupImageMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(info) {
        super(info.name, info.icon, {
            style_class: 'place-menu-item',
        });
        this._info = info;

        if (info.isRemovable()) {
            this._ejectIcon = new St.Icon({
                icon_name: 'media-eject-symbolic',
                style_class: 'popup-menu-icon',
            });
            this._ejectButton = new St.Button({
                child: this._ejectIcon,
                style_class: 'button',
            });
            this._ejectButton.connect('clicked', info.eject.bind(info));
            this.add_child(this._ejectButton);
        }

        info.connectObject('changed',
            this._propertiesChanged.bind(this), this);
    }

    activate(event) {
        this._info.launch(event.get_time());

        super.activate(event);
    }

    _propertiesChanged(info) {
        this.setIcon(info.icon);
        this.label.text = info.name;
    }
}

const SECTIONS = [
    'special',
    'bookmarks',
    'devices',
    'network',
];

const SECTIONS2 = [
    //'special',
    //'bookmarks',
    'devices',
    'network',
];

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

const ActivitiesMenuButton = GObject.registerClass(
class ActivitiesMenuButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, null);
        
        this.menu.actor.add_style_class_name('aggregate-menu');

        let menuLayout = new AggregateLayout();
        this.menu.box.set_layout_manager(menuLayout);

        this.set({
            name: 'panelActivitiesMenu',
            accessible_role: Atk.Role.TOGGLE_BUTTON,
            /* Translators: If there is no suitable word for "Activities"
               in your language, you can use the word for "Overview". */
            accessible_name: _('ActivitiesMenu'),
        });
        
        let bin = new St.Bin({name: 'activitiesMenu'});
        this.add_child(bin);
        
        this._container = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        bin.set_child(this._container);
        
        this._iconBox = new St.Bin({
        y_align: Clutter.ActorAlign.CENTER,
        });         
        this._container.add_child(this._iconBox);        
          
        this._label = new St.Label({
            text: _('debian'),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'activities-label',
        });        
        //this._container.add_child(this._label);
        
        const icon = new St.Icon({
            icon_name: 'debian-logo-symbolic',
            style_class: 'activities-icon',
        });
        this._iconBox.set_child(icon);
        
        this.label_actor = this._label;
        
        this._systemActions = new SystemActions.getDefault();

        this._createSubMenu();

        this._loginScreenItem.connect('notify::visible',
            () => this._updateSessionSubMenu());
        this._logoutItem.connect('notify::visible',
            () => this._updateSessionSubMenu());
        this._suspendItem.connect('notify::visible',
            () => this._updateSessionSubMenu());
        this._powerOffItem.connect('notify::visible',
            () => this._updateSessionSubMenu());
        this._restartItem.connect('notify::visible',
            () => this._updateSessionSubMenu());
        // Whether shutdown is available or not depends on both lockdown
        // settings (disable-log-out) and Polkit policy - the latter doesn't
        // notify, so we update the menu item each time the menu opens or
        // the lockdown setting changes, which should be close enough.
        this.menu.connect('open-state-changed', (menu, open) => {
            if (!open)
                return;

            this._systemActions.forceUpdate();
        });
        this._updateSessionSubMenu();

        Main.sessionMode.connect('updated', this._sessionUpdated.bind(this));
        this._sessionUpdated();
        
        this.smappsitem = new PopupMenu.PopupSubMenuMenuItem(_('Items'), true);
        this.smappsitem.icon.icon_name = 'document-open-recent-symbolic';

        this._showingSignal = Main.overview.connect('showing', () => {
            this.add_style_pseudo_class('checked');
            this.add_accessible_state(Atk.StateType.CHECKED);
        });        
        
        this._hidingSignal = Main.overview.connect('hiding', () => {
            this.remove_style_pseudo_class('checked');
            this.remove_accessible_state(Atk.StateType.CHECKED);
        });

        this._xdndTimeOut = 0;
        
        //this._osdWindow = new osdWindow.OsdWindow(Main.layoutManager.monitors.length);
        
        this.menu_build();
        /*this.menu.connect('open-state-changed', (menu, open) => {
            if (open) {
                this.menu.removeAll();
                this.menu_build();
                }
        });*/   
    }
    
        
    
    _sessionUpdated() {
        this._settingsItem.visible = Main.sessionMode.allowSettings;
    }

    _updateSessionSubMenu() {
        this._sessionSubMenu.visible =
            this._loginScreenItem.visible ||
            this._logoutItem.visible ||
            this._suspendItem.visible ||
            this._restartItem.visible ||
            this._powerOffItem.visible;
    }

    _createSubMenu() {
        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;
        let item;
        

        item = new PopupMenu.PopupImageMenuItem(
            this._systemActions.getName('lock-orientation'),
            this._systemActions.orientation_lock_icon);

        item.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activateLockOrientation();
        });
        //this.menu.addMenuItem(item);
        this._orientationLockItem = item;
        this._systemActions.bind_property('can-lock-orientation',
            this._orientationLockItem, 'visible',
            bindFlags);
        this._systemActions.connect('notify::orientation-lock-icon', () => {
            let iconName = this._systemActions.orientation_lock_icon;
            let labelText = this._systemActions.getName("lock-orientation");

            this._orientationLockItem.setIcon(iconName);
            this._orientationLockItem.label.text = labelText;
        });

        let app = this._settingsApp = Shell.AppSystem.get_default().lookup_app(
            'gnome-control-center.desktop');
        if (app) {
            const [icon] = app.app_info.get_icon().names;
            const name = app.app_info.get_name();
            item = new PopupMenu.PopupImageMenuItem(name, icon);
            item.connect('activate', () => {
                this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
                Main.overview.hide();
                this._settingsApp.activate();
            });
            this.menu.addMenuItem(item);
            this._settingsItem = item;
        } else {
            log('Missing required core component Settings, expect trouble…');
            this._settingsItem = new St.Widget();
        }

        /*item = new PopupMenu.PopupImageMenuItem(_('Lock'), 'changes-prevent-symbolic');
        item.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activateLockScreen();
        });
        //this.menu.addMenuItem(item);
        this._lockScreenItem = item;
        this._systemActions.bind_property('can-lock-screen',
            this._lockScreenItem, 'visible',
            bindFlags);*/

        this._sessionSubMenu = new PopupMenu.PopupSubMenuMenuItem(
            _('Power Off / Log Out...'), true, {});
        this._sessionSubMenu.icon.icon_name = 'system-shutdown-symbolic';

        var userManager = AccountsService.UserManager.get_default();
        var user = userManager.get_user(GLib.get_user_name());
        this._userWidget = new userWidget.UserWidget(user);
        this.box = new St.BoxLayout({
            //x_expand: true,
            y_expand: true,
            vertical: true,
            //x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
            });
        //this.box.insert_child_at_index(new userWidget.UserWidget(user, Clutter.Orientation.VERTICAL), 0);
        this.box.add_child(new userWidget.UserWidget(user));
        this.menu.box.add_child(this.box);    

            
        item = new PopupMenu.PopupMenuItem(_('Suspend'));
        item.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activateSuspend();
        });
        this._sessionSubMenu.menu.addMenuItem(item);
        this._suspendItem = item;
        this._systemActions.bind_property('can-suspend',
            this._suspendItem, 'visible',
            bindFlags);

        item = new PopupMenu.PopupMenuItem(_('Restart…'));
        item.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activateRestart();
        });
        this._sessionSubMenu.menu.addMenuItem(item);
        this._restartItem = item;
        this._systemActions.bind_property('can-restart',
            this._restartItem, 'visible',
            bindFlags);

        item = new PopupMenu.PopupMenuItem(_('Power Off…'));
        item.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activatePowerOff();
        });
        this._sessionSubMenu.menu.addMenuItem(item);
        this._powerOffItem = item;
        this._systemActions.bind_property('can-power-off',
            this._powerOffItem, 'visible',
            bindFlags);
            
        this._sessionSubMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
        item = new PopupMenu.PopupMenuItem(_('Log Out...'));
        item.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activateLogout();
        });
        this._sessionSubMenu.menu.addMenuItem(item);
        //this.menu.addMenuItem(item);
        this._logoutItem = item;
        this._systemActions.bind_property('can-logout',
            this._logoutItem, 'visible',
            bindFlags);

        item = new PopupMenu.PopupMenuItem(_('Switch User…'));
        item.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activateSwitchUser();
        });
        this._sessionSubMenu.menu.addMenuItem(item);
        //this.menu.addMenuItem(item);
        this._loginScreenItem = item;
        this._systemActions.bind_property('can-switch-user',
            this._loginScreenItem, 'visible',
            bindFlags);
            
        

        //this.menu.addMenuItem(this._sessionSubMenu);
    }
    
    
    PlaceMenu(secs) {    
        this.placesManager = new PlacesManager();

        this._sections = { };

        for (let i = 0; i < secs.length; i++) {
            let id = secs[i];
            this._sections[id] = new PopupMenu.PopupMenuSection();
            this.placesManager.connect(`${id}-updated`, () => {
                this._redisplay(id);
            });

            this._create(id);
            this.smitemplaces.menu.addMenuItem(this._sections[id]);
            this.smitemplaces.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            //this.menu.addMenuItem(this._sections[id]);
            //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay(id) {
        this._sections[id].removeAll();
        this._create(id);
    }

    _create(id) {
        let places = this.placesManager.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections[id].actor.visible = places.length > 0;
    }
    
    add_item(app) {
        let item = new PopupMenu.PopupMenuItem('', {style_class: 'items-item'}); //BaseMenuItem;
        this.smappsitem.menu.addMenuItem(item);
        let box = new St.BoxLayout({vertical: false, style_class: 'panel-apps-favorites-box'});
        item.actor.add_child(box);
        let icon = app.create_icon_texture(22);
        item.insert_child_at_index(icon, 0);
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
    let count = 0;
        Shell.AppUsage.get_default().get_most_used().forEach((app) => {
            if (count < 4) {
            this.add_item(app);
            count++;
            }
        });
        
        this.smappsitem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        
        const MAX_ITEMS = 4; //this._settings.get_int('max-items'); // ← gsettings から取得

    const bookmark = new GLib.BookmarkFile();
    const xbelPath = GLib.build_filenamev([
        GLib.get_home_dir(),
        '.local/share/recently-used.xbel'
    ]);

    try {
        bookmark.load_from_file(xbelPath);

        const items = bookmark.get_uris();

        if (items.length === 0) {
            this._indicator.menu.addMenuItem(
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
            this._indicator.menu.addMenuItem(
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
                icon_size: 22,
                //style_class: 'popup-menu-icon'
            });

            item.insert_child_at_index(icon, 0);
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
        const now = Math.floor(Date.now() / 1000);

        // ★ タイムスタンプ更新
        bookmark2.set_modified(uri, now);

        // ★ 保存
        bookmark2.to_file(xbelPath);

    } catch (e) {
        log(`XBEL update error: ${e}`);
    }

    // ★ 最後にファイルを開く
    Gio.AppInfo.launch_default_for_uri(uri, null);
});
            
            this.smappsitem.menu.addMenuItem(item);
        }

    } catch (e) {
        this.smappsitem._indicator.menu.addMenuItem(
            new PopupMenu.PopupMenuItem(`Error: ${e}`, { reactive: false })
        );
    }
    
    }
    
    menu_build() {
        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;
        let iteml;
    
    
        let itemsearch = new PopupMenu.PopupImageMenuItem(_('Search'), 'org.gnome.Settings-search-symbolic', {style_class: 'activities-menu-item'});
        itemsearch.connect('activate', () => {
        if (Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();
        });
        
        let item2 = new PopupMenu.PopupImageMenuItem(_('Apps'), 'view-app-grid-symbolic');
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
        
        let itemapps = new PopupMenu.PopupImageMenuItem(_('Apps'), 'org.gnome.Settings-applications-symbolic');
        itemapps.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-applications-panel.desktop').activate();
        });
                
        //this.smappsitem = new PopupMenu.PopupSubMenuMenuItem(_('Apps'), true);
        //this.smappsitem.icon.icon_name = 'org.gnome.Settings-applications-symbolic';
        
        //this.smappsitem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Apps'));
        
        this.submenubuild();
        
        
        let itemsettings = new PopupMenu.PopupImageMenuItem(_('Settings'), 'org.gnome.Settings-system-symbolic');
        itemsettings.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop').activate();
        });
        
        let itemsoftware = new PopupMenu.PopupImageMenuItem(_('Software'), 'org.gnome.Software-symbolic');
        itemsoftware.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop').activate();
        });
        
        let itemusers = new PopupMenu.PopupImageMenuItem(_('Users'), 'org.gnome.Settings-users-symbolic');
        itemusers.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-users-panel.desktop').activate();
        });
        
        let itemabout = new PopupMenu.PopupImageMenuItem(_('About'), 'org.gnome.Settings-about-symbolic');
        itemabout.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-about-panel.desktop').activate();
        });
        
        let itemhelp = new PopupMenu.PopupImageMenuItem(_('Help'), 'help-browser-symbolic');
        itemhelp.connect('activate', () => {
            if (Shell.AppSystem.get_default().lookup_app('yelp.desktop')) {
                Shell.AppSystem.get_default().lookup_app('yelp.desktop').activate();
            }
            else {
            Gio.AppInfo.launch_default_for_uri_async('https://discourse.gnome.org/', global.create_app_launch_context(0, -1), null)
            }
        });    
        
        
        const homeFile = Gio.File.new_for_path(GLib.get_home_dir());
        let itemhome = new PopupMenu.PopupImageMenuItem(_('Home'), 'user-home-symbolic');
        itemhome.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri_async(homeFile.get_uri(), global.create_app_launch_context(0, -1), null);
        });
        
        /*let itemr = new PopupMenu.PopupImageMenuItem(_('Recent'), 'document-open-recent-symbolic');
        itemr.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri_async('recent:///', global.create_app_launch_context(0, -1), null);
        });*/

        let itemr = new PopupMenu.PopupImageMenuItem(_('Files'), 'x-office-document');
        itemr.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri_async('recent:///', global.create_app_launch_context(0, -1), null);
        });
        
        const appSystem = Shell.AppSystem.get_default();
        const nautilusApp = appSystem.lookup_app('org.gnome.Nautilus.desktop');
        const defaultFm = Gio.AppInfo.get_default_for_type('inode/directory', true);
        const showNautilusSpecials =
            nautilusApp && defaultFm && nautilusApp.appInfo.equal(defaultFm);

        let items = new PopupMenu.PopupImageMenuItem(_('Starred'), 'starred-symbolic');        
        items.connect('activate', () => {
            nautilusApp.appInfo.launch([Gio.File.new_for_uri('starred:///')], global.create_app_launch_context(0, -1));
        });
        
        let itemn = new PopupMenu.PopupImageMenuItem(_('Network'), 'network-workgroup-symbolic');        
        itemn.connect('activate', () => {
            nautilusApp.appInfo.launch([Gio.File.new_for_uri('x-network-view:///')], global.create_app_launch_context(0, -1));
        });
        
        const downloadFile = Gio.File.new_for_path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD));
        let itemdownload = new PopupMenu.PopupImageMenuItem(_('Download'), 'folder-download-symbolic');
        itemdownload.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri_async(downloadFile.get_uri(), global.create_app_launch_context(0, -1), null);
        });
        
        iteml = new PopupMenu.PopupImageMenuItem(_('Lock'), 'changes-prevent-symbolic');
        iteml.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this._systemActions.activateLockScreen();
        });
        //this.menu.addMenuItem(iteml);
        this._lockScreenItem = iteml;
        this._systemActions.bind_property('can-lock-screen',
            this._lockScreenItem, 'visible',
            bindFlags);
        
        this.smitemplaces = new PopupMenu.PopupSubMenuMenuItem(_('Places'), true, {});
        this.smitemplaces.icon.icon_name = 'folder-symbolic';
        
        this.menu.addMenuItem(itemsearch);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        //this.menu.addMenuItem(itemusers);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                 
        this.menu.addMenuItem(this.smappsitem);
        //this.smappsitem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        //this.smappsitem.menu.addMenuItem(itemr);
        //this.menu.addMenuItem(itemapps);
        //this.menu.addMenuItem(this.smitemplaces);
        //this.PlaceMenu(SECTIONS);
        //this.PlaceMenu(SECTIONS2);
        //this.menu.addMenuItem(itemr);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(itemsettings);
        this.menu.addMenuItem(itemsoftware);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(itemhelp);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(itemabout);
        //this.menu.addMenuItem(itemusers);
        
        //
        //this.menu.addMenuItem(itemusers); 
        //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
           
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(iteml);
        this.menu.addMenuItem(this._sessionSubMenu);
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
        if (event.type() === Clutter.EventType.TOUCH_END ||
            event.type() === Clutter.EventType.BUTTON_RELEASE) {
            if (Main.overview.shouldToggleByCornerOrButton())
                this.menu.toggle();
                //Main.overview.toggle();
                //return Clutter.EVENT_PROPAGATE;
        }
        /*if (event.type() === Clutter.EventType.SCROLL) {
            this._osdWindowManager._showOsdWindow(monitorIndex);
            return Clutter.EVENT_PROPAGATE;
            }*/

        return Main.wm.handleWorkspaceScroll(event);
        //return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_release_event(event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_space) {
            if (Main.overview.shouldToggleByCornerOrButton()) {
                this.menu.toggle();
                //Main.overview.toggle();
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _xdndToggleOverview() {
        let [x, y] = global.get_pointer();
        let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

        if (pickedActor === this && Main.overview.shouldToggleByCornerOrButton())
            this.menu.toggle();

        GLib.source_remove(this._xdndTimeOut);
        this._xdndTimeOut = 0;
        return GLib.SOURCE_REMOVE;
    }
    
    destroy() {
        if (this._showingSignal) {
            Main.overview.disconnect(this._showingSignal);
            this._showingSignal = null;
        }

        if (this._hidingSignal) {
            Main.overview.disconnect(this._hidingSignal);
            this._hidingSignal = null;
        }

        if (this._xdndTimeOut) {
            GLib.Source.remove(this._xdndTimeOut);
            this._xdndTimeOut = null;
        }
        
        //this.placesManager.destroy();
        
        super.destroy();
    }
});

export default class IndicatorExampleExtension extends Extension {

    enable() {
        if (Main.panel.statusArea['activities'])
            Main.panel.statusArea['activities'].hide();
        this._indicator = new ActivitiesMenuButton();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'left');
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        if (Main.panel.statusArea['activities']) {
        if (Main.sessionMode.currentMode !== 'unlock-dialog')
            Main.panel.statusArea['activities'].show();}
    }
}
