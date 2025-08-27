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
import {PlacesManager} from './placeDisplay.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

Gio._promisify(Gio.AppInfo, 'launch_default_for_uri_async');

class PlaceMenuItem extends PopupMenu.PopupImageMenuItem { //PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(info) {
        super(info.name, info.icon, {
        //super(info.name, {
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
    //'devices',
    //'bookmarks',
    //'network',
];

const SECTIONS2 = [
    //'special',
    'devices',
    //'bookmarks',
    //'network',
];

const SECTIONS3 = [
    //'home',
    //'special',
    //'devices',
    'bookmarks',
    //'network',
];

const SECTIONS4 = [
    //'home',
    //'special',
    //'devices',
    //'bookmarks',
    'network1',
];

const SECTIONS5 = [
    //'home',
    //'special',
    //'devices',
    //'bookmarks',
    'network',
];

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
        });        
        this._container.add_child(this._label);
        
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
        this.menu.connect('open-state-changed', (menu, open) => {
            this.menu.removeAll();
            this.menu_build();
        });
    } 
    
    placesMenu() {
        this.placesManager = new PlacesManager();

        this._sections = { };

        for (let i = 0; i < SECTIONS.length; i++) {
            let id = SECTIONS[i];
            this._sections[id] = new PopupMenu.PopupMenuSection();
            this.placesManager.connect(`${id}-updated`, () => {
                this._redisplay(id);
            });

            this._create(id);
            this.addMenuItem(this._sections[id]);
            //this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
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
    
    placesMenu2() {
        this.placesManager2 = new PlacesManager();

        this._sections2 = { };

        for (let i = 0; i < SECTIONS2.length; i++) {
            let id = SECTIONS2[i];
            this._sections2[id] = new PopupMenu.PopupMenuSection();
            this.placesManager2.connect(`${id}-updated`, () => {
                this._redisplay2(id);
            });

            this._create2(id);
            this.smitemd.menu.addMenuItem(this._sections2[id]);
            this.smitemd.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay2(id) {
        this._sections2[id].removeAll();
        this._create2(id);
    }

    _create2(id) {
        let places = this.placesManager2.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections2[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections2[id].actor.visible = places.length > 0;
    }
    
    placesMenu3() {
        this.placesManager3 = new PlacesManager();

        this._sections3 = { };

        for (let i = 0; i < SECTIONS4.length; i++) {
            let id = SECTIONS4[i];
            this._sections3[id] = new PopupMenu.PopupMenuSection();
            this.placesManager3.connect(`${id}-updated`, () => {
                this._redisplay3(id);
            });

            this._create3(id);
            this.smitemd.menu.addMenuItem(this._sections3[id]);
            this.smitemd.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay3(id) {
        this._sections3[id].removeAll();
        this._create3(id);
    }

    _create3(id) {
        let places = this.placesManager3.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections3[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections3[id].actor.visible = places.length > 0;
    }
    
    placesMenu4() {
        this.placesManager4 = new PlacesManager();

        this._sections4 = { };

        for (let i = 0; i < SECTIONS5.length; i++) {
            let id = SECTIONS5[i];
            this._sections4[id] = new PopupMenu.PopupMenuSection();
            this.placesManager4.connect(`${id}-updated`, () => {
                this._redisplay4(id);
            });

            this._create4(id);
            this.smitemd.menu.addMenuItem(this._sections4[id]);
            this.smitemd.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay4(id) {
        this._sections4[id].removeAll();
        this._create4(id);
    }

    _create4(id) {
        let places = this.placesManager4.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections4[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections4[id].actor.visible = places.length > 0;
    }
    
    appsMenu() {
        let web = Gio.AppInfo.get_default_for_type('x-scheme-handler/https', true);
        let mail = Gio.AppInfo.get_default_for_type('x-scheme-handler/mailto', true);
        let calendar = Gio.AppInfo.get_default_for_type('text/calendar', true);
        let music = Gio.AppInfo.get_default_for_type('audio/mpeg', true);
        let video = Gio.AppInfo.get_default_for_type('video/mpeg', true);
        let photos = Gio.AppInfo.get_default_for_type('image/jpeg', true);
        let files = Gio.AppInfo.get_default_for_type('inode/directory', true);
        
        let itema1 = new PopupMenu.PopupImageMenuItem(_('Web'), 'web-browser-symbolic');
        itema1.connect('activate', () => {
        web.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema2 = new PopupMenu.PopupImageMenuItem(_('Mail'), 'mail-unread-symbolic');
        itema2.connect('activate', () => {
        mail.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema3 = new PopupMenu.PopupImageMenuItem(_('Calendar'), 'x-office-calendar-symbolic');
        itema3.connect('activate', () => {
        calendar.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema4 = new PopupMenu.PopupImageMenuItem(_('Music'), 'audio-x-generic-symbolic');
        itema4.connect('activate', () => {
        music.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema5 = new PopupMenu.PopupImageMenuItem(_('Video'), 'video-x-generic-symbolic');
        itema5.connect('activate', () => {
        video.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema6 = new PopupMenu.PopupImageMenuItem(_('Photos'), 'image-x-generic-symbolic');
        itema6.connect('activate', () => {
        photos.launch([], global.create_app_launch_context(0, -1));
        });
        
        let itema7 = new PopupMenu.PopupImageMenuItem(_('Files'), 'system-file-manager-symbolic');
        itema7.connect('activate', () => {
        files.launch([], global.create_app_launch_context(0, -1));
        });
        
        /*if(web)
        itema1.setIcon(web.get_icon());
        if(mail)
        itema2.setIcon(mail.get_icon());
        if(calendar)
        itema3.setIcon(calendar.get_icon());
        if(music)
        itema4.setIcon(music.get_icon());
        if(video)
        itema5.setIcon(video.get_icon());
        if(photos)
        itema6.setIcon(photos.get_icon());*/
        
        const homeFile = Gio.File.new_for_path(GLib.get_home_dir());
        let itemhome = new PopupMenu.PopupImageMenuItem(_('Home'), 'user-home-symbolic');
        //let itemhome = new PopupMenu.PopupImageMenuItem(_('Files'), 'system-file-manager-symbolic');
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
        
        if(web)
        this.menu.addMenuItem(itema1);
        /*this.smitemf = new PopupMenu.PopupSubMenuMenuItem(_('Files'), true, {});
        this.smitemf.icon.icon_name = 'system-file-manager-symbolic';
        this.smitemf.menu.addMenuItem(itemhome);
        this.smitemf.menu.addMenuItem(itemr);
        if(showNautilusSpecials) {
        this.smitemf.menu.addMenuItem(items);
        this.smitemf.menu.addMenuItem(itemn);
        }
        //this.menu.addMenuItem(this.smitemf);*/
        if(photos)
        this.menu.addMenuItem(itema6);
        if(calendar)
        this.menu.addMenuItem(itema3);
        
        if(music)
        this.menu.addMenuItem(itema4);
        //if(mail)
        //this.menu.addMenuItem(itema2);
        //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        //if(files)
        //this.menu.addMenuItem(itema7); //this.smitemf); //itema7);*/
    }
    
    menu_build() {    
        let item9 = new PopupMenu.PopupImageMenuItem(_('Online Accounts'), 'org.gnome.Settings-online-accounts-symbolic');
        item9.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-online-accounts-panel.desktop').activate();
        });    
        
        let item8 = new PopupMenu.PopupImageMenuItem(_('Settings'), 'org.gnome.Settings-system-symbolic');
        item8.connect('activate', () => {
        Shell.AppSystem.get_default().lookup_app('gnome-system-panel.desktop').activate();
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
        item26.menu.addMenuItem(item21);        
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
        Gio.AppInfo.launch_default_for_uri_async('https://www.reddit.com/r/gnome/', global.create_app_launch_context(0, -1), null)
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
        
        const homeFile = Gio.File.new_for_path(GLib.get_home_dir());
        let itemhome = new PopupMenu.PopupImageMenuItem(_('Home'), 'user-home-symbolic');
        //let itemhome = new PopupMenu.PopupImageMenuItem(_('Files'), 'system-file-manager-symbolic');
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
        
        
        
        this.menu.addMenuItem(item);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.appsMenu();
        //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        /*this.menu.addMenuItem(itemhome);
        this.menu.addMenuItem(itemr);
        if(showNautilusSpecials) {
            this.menu.addMenuItem(items);
            this.menu.addMenuItem(itemn);
        }
        this.smitemd = new PopupMenu.PopupSubMenuMenuItem(_('Drives'), true, {});
        this.smitemd.icon.icon_name = 'drive-harddisk-symbolic';
        this.menu.addMenuItem(this.smitemd);        
        this.placesMenu2();
        this.placesMenu3();
        this.placesMenu4();*/
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(item17);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());        
        this.menu.addMenuItem(item8);
        this.menu.addMenuItem(item26);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());        
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
