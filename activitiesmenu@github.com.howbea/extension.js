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

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as userWidget from 'resource:///org/gnome/shell/ui/userWidget.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
            text: _('andRose'),
            y_align: Clutter.ActorAlign.CENTER,
        });        
        this._container.add_child(this._label);
        
        const icon = new St.Icon({
            icon_name: 'rose',
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
        this.smitema.menu.connect('open-state-changed', (open) => {
            this.smitema.menu.removeAll();
            this.appsMenu();
        });
    }
    
    appsMenu() {
        let Web = Gio.AppInfo.get_default_for_type('x-scheme-handler/https', true);
        let Mail = Gio.AppInfo.get_default_for_type('x-scheme-handler/mailto', true);
        let Calendar = Gio.AppInfo.get_default_for_type('text/calendar', true);
        let Music = Gio.AppInfo.get_default_for_type('audio/mpeg', true);
        let Video = Gio.AppInfo.get_default_for_type('video/mpeg', true);
        let Photos = Gio.AppInfo.get_default_for_type('image/jpeg', true);
        
        let itema1 = new PopupMenu.PopupImageMenuItem(_('Web'), 'web-browser-symbolic');
        itema1.connect('activate', () => {
        Web.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema2 = new PopupMenu.PopupImageMenuItem(_('Mail'), 'mail-unread-symbolic');
        itema2.connect('activate', () => {
        Mail.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema3 = new PopupMenu.PopupImageMenuItem(_('Calendar'), 'x-office-calendar-symbolic');
        itema3.connect('activate', () => {
        Calendar.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema4 = new PopupMenu.PopupImageMenuItem(_('Music'), 'audio-x-generic-symbolic');
        itema4.connect('activate', () => {
        Music.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema5 = new PopupMenu.PopupImageMenuItem(_('Video'), 'video-x-generic-symbolic');
        itema5.connect('activate', () => {
        Video.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema6 = new PopupMenu.PopupImageMenuItem(_('Photos'), 'image-x-generic-symbolic');
        itema6.connect('activate', () => {
        Photos.launch([], global.create_app_launch_context(0, -1));
        });
        
        if(Web)
        itema1.setIcon(Web.get_icon());
        if(Mail)
        itema2.setIcon(Mail.get_icon());
        if(Calendar)
        itema3.setIcon(Calendar.get_icon());
        if(Music)
        itema4.setIcon(Music.get_icon());
        if(Video)
        itema5.setIcon(Video.get_icon());
        if(Photos)
        itema6.setIcon(Photos.get_icon());
        
        this.smitema.menu.addMenuItem(itema1);
        this.smitema.menu.addMenuItem(itema2);
        this.smitema.menu.addMenuItem(itema3);
        this.smitema.menu.addMenuItem(itema6);
    }
    
    menu_build() {    
        let item9 = new PopupMenu.PopupImageMenuItem(_('Online Accounts'), 'org.gnome.Settings-online-accounts-symbolic');
        item9.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-online-accounts-panel.desktop').activate();
        });    
        
        let item8 = new PopupMenu.PopupImageMenuItem(_('Settings'), 'org.gnome.Settings-system-symbolic');
        item8.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop').activate();
        });
        
        let item26 = new PopupMenu.PopupSubMenuMenuItem(_('Users'), true);
        item26.icon.icon_name = 'org.gnome.Settings-users-symbolic';
        
        var userManager = AccountsService.UserManager.get_default();
        var user = userManager.get_user(GLib.get_user_name());
        let item6 = new PopupMenu.PopupBaseMenuItem();
        item6.insert_child_at_index(new userWidget.UserWidget(user), 0);
        item6.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-users-panel.desktop').activate();
        });
        
        let item21 = new PopupMenu.PopupMenuItem('');
        let label = new St.Label({
            text: _('Log Out...'),
            });
        item21.add_child(label);
        item21.connect('activate', () => {
        Util.spawn(['gnome-session-quit', '--logout']);
        });
        
        item26.menu.addMenuItem(item6);
        //item26.menu.addMenuItem(item21);        
        item26.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        item26.menu.addMenuItem(item9);
        
        this.smitema = new PopupMenu.PopupSubMenuMenuItem(_('Apps'), true);
        this.smitema.icon.icon_name = 'org.gnome.Settings-applications-symbolic';
        
        let item7 = new PopupMenu.PopupImageMenuItem(_('About'), 'org.gnome.Settings-about-symbolic');
        item7.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-about-panel.desktop').activate();
        });
        
        let item17 = new PopupMenu.PopupImageMenuItem(_('Help'), 'help-browser-symbolic');
        item17.connect('activate', () => {
        Gio.AppInfo.launch_default_for_uri_async('https://docs.centos.org/', global.create_app_launch_context(0, -1), null)
        //Shell.AppSystem.get_default().lookup_app('yelp.desktop').activate();
        });        
        
        let item18 = new PopupMenu.PopupImageMenuItem(_('Softwear'), 'org.gnome.Software-symbolic');
        item18.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop').activate();
        });
        
        let item = new PopupMenu.PopupImageMenuItem(_('Search'), 'org.gnome.Settings-search-symbolic', {style_class: 'activities-menu'});
        item.connect('activate', () => {
        if (Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();
        });
        
        let itemr = new PopupMenu.PopupImageMenuItem(_('Recent'), 'document-open-recent-symbolic');
        itemr.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri_async('recent:///', global.create_app_launch_context(0, -1), null);
        });
        
        let itemapps = new PopupMenu.PopupImageMenuItem(_('Apps'), 'view-appgrid');
        itemapps.connect("activate", () => {
            if (Main.overview.shouldToggleByCornerOrButton()) {
            if(Main.overview.dash.showAppsButton.checked) {
            Main.overview.dash.showAppsButton.checked = false;
            }
            else {
            if (Main.overview.shouldToggleByCornerOrButton())
                Main.overview.show();
            Main.overview.dash.showAppsButton.checked = true;
            }
            }
        });
        
        
        
        this.menu.addMenuItem(item);
        this.menu.addMenuItem(itemapps);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        //this.menu.addMenuItem(this.smitema);
        //this.appsMenu();
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
       // this.menu.addMenuItem(itemr);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());        
        this.menu.addMenuItem(item8);
        this.menu.addMenuItem(item17);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(item18);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(item26);
        
        this.menu.addMenuItem(item7);        
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
        this._indicator = new ActivitiesMenuButton();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'left');
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
