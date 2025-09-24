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
import * as quicksettings from './quicksettings.js';

Gio._promisify(Gio.AppInfo, 'launch_default_for_uri_async');

const ActivitiesMenuButton = GObject.registerClass(
class ActivitiesMenuButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, null);

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
            text: _('GNOME'),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'activities-label',
        });        
        //this._container.add_child(this._label);
        
        const icon = new St.Icon({
            icon_name: 'start-here',
            style_class: 'activities-icon',
        });
        this._iconBox.set_child(icon);
        
        this.label_actor = this._label;

        this._showingSignal = Main.overview.connect('showing', () => {
            this.add_style_pseudo_class('checked');
            this.add_accessible_state(Atk.StateType.CHECKED);
        });        
        
        this._hidingSignal = Main.overview.connect('hiding', () => {
            this.remove_style_pseudo_class('checked');
            this.remove_accessible_state(Atk.StateType.CHECKED);
        });

        this._xdndTimeOut = 0;
        
        this.menu_build();
        /*this.menu.connect('open-state-changed', (menu, open) => {
            this.menu.removeAll();
            this.menu_build();
        });*/
    }
    
    menu_build() {
    
        let itemsearch = new PopupMenu.PopupImageMenuItem(_('Search'), 'org.gnome.Settings-search-symbolic', {style_class: 'activities-menu'});
        itemsearch.connect('activate', () => {
        if (Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();
        });
        
        let itemapps = new PopupMenu.PopupImageMenuItem(_('Apps'), 'org.gnome.Settings-applications-symbolic');
        itemapps.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-applications-panel.desktop').activate();
        });
        
        let itemsettings = new PopupMenu.PopupImageMenuItem(_('Settings'), 'org.gnome.Settings-system-symbolic');
        itemsettings.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-system-panel.desktop').activate();
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
        Gio.AppInfo.launch_default_for_uri_async('https://www.debian.org/support', global.create_app_launch_context(0, -1), null)
        //Shell.AppSystem.get_default().lookup_app('yelp.desktop').activate();
        });    
        
        
        const homeFile = Gio.File.new_for_path(GLib.get_home_dir());
        let itemhome = new PopupMenu.PopupImageMenuItem(_('Home'), 'user-home-symbolic');
        itemhome.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri_async(homeFile.get_uri(), global.create_app_launch_context(0, -1), null);
        });
        
        let itemr = new PopupMenu.PopupImageMenuItem(_('Recent'), 'document-open-recent-symbolic');
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
        
        this.menu.addMenuItem(itemsearch);
        this.menu.addMenuItem(itemapps);        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(itemr);        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(itemsettings);
        this.menu.addMenuItem(itemusers);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        //this.menu.addMenuItem(itemhelp);
        this.menu.addMenuItem(itemabout);                
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
        }

        return Main.wm.handleWorkspaceScroll(event);
    }

    vfunc_key_release_event(event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_space) {
            if (Main.overview.shouldToggleByCornerOrButton()) {
                this.menu.toggle();
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
    
    _onDestroy() {
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
