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
import AccountsService from 'gi://AccountsService';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension, gettext as _} from
    'resource:///org/gnome/shell/extensions/extension.js';

import * as PanelMenu from
    'resource:///org/gnome/shell/ui/panelMenu.js';

import * as PopupMenu from
    'resource:///org/gnome/shell/ui/popupMenu.js';

import * as userWidget from 'resource:///org/gnome/shell/ui/userWidget.js';

import * as Main from
    'resource:///org/gnome/shell/ui/main.js';


const userManager = AccountsService.UserManager.get_default();
const user = userManager.get_user(GLib.get_user_name());


const AggregateLayout = GObject.registerClass(
class AggregateLayout extends Clutter.BoxLayout {
    _init(params = {}) {
        params.orientation = Clutter.Orientation.VERTICAL;
        super._init(params);

        this._sizeChildren = [];
    }

    addSizeChild(actor) {
        this._sizeChildren.push(actor);
        this.layout_changed();
    }

    vfunc_get_preferred_width(container, forHeight) {
        const themeNode = container.get_theme_node();
        let minWidth = themeNode.get_min_width();
        let natWidth = minWidth;

        for (const child of this._sizeChildren) {
            const [childMin, childNat] =
                child.get_preferred_width(forHeight);

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

        const menuLayout = new AggregateLayout();
        this.menu.box.set_layout_manager(menuLayout);
        this.menu.box.add_style_class_name('aggregate-menu');

        this.set({
            name: 'panelAvatarMenu',
            accessible_role: Atk.Role.TOGGLE_BUTTON,
            accessible_name: _('AvatarMenu'),
        });

        const bin = new St.Bin({
            name: 'avatarMenu',
        });

        this.add_child(bin);

        this._container = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
        });

        bin.set_child(this._container);

        this._iconBox = new St.Bin({
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._container.add_child(this._iconBox);

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'avatar-label',
        });

        const avatarIcon = new St.Icon({
            icon_name: 'avatar-default-symbolic',
            style_class: 'avatar-icon',
        });

        this._iconBox.set_child(avatarIcon);

        this.label_actor = this._label;

        this._createDndWidget();
        this._createMenu();
    }


    _createDndWidget() {
        const userManager = AccountsService.UserManager.get_default();
        const user = userManager.get_user(GLib.get_user_name());

        this._avatar = new userWidget.UserWidget(user, {
            y_expand: true,
            x_expand: true,
        });

        this._avatar._avatar.x_expand = true;
        this._avatar._label.x_expand = true;

        const button = new St.Button({
            style_class: 'icon-button avatar-overlay-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: new St.Icon({
                icon_name:
                    'org.gnome.Settings-notifications-symbolic',
                style_class: 'popup-menu-icon',
            }),
        });

        const label = new St.Label({
            text: 'Available',
            y_expand: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.END,
        });

        this._nbox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
        });

        this._nbox.add_child(button);
        this._nbox.add_child(label);

        this._box = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            style_class: 'avatar-widget',
            y_expand: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });

        this._box.add_child(this._avatar);
        this._box.add_child(this._nbox);

        this._notificationSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.notifications',
        });

        const update = () => {
            if (this._notificationSettings.get_boolean('show-banners')) {
                button.child.icon_name =
                    'org.gnome.Settings-notifications-symbolic';
                label.text = 'Available';
            } else {
                button.child.icon_name =
                    'notifications-disabled-symbolic';
                label.text = 'Do Not Disturb';
            }
        };

        update();

        this._notificationChangedId =
            this._notificationSettings.connect(
                'changed::show-banners',
                update
            );

        this._nbox.x = 50;
        this._nbox.y = 50;

        button.connect('clicked', () => {
            const enabled =
                this._notificationSettings.get_boolean('show-banners');

            this._notificationSettings.set_boolean(
                'show-banners',
                !enabled
            );
        });

        this.menu.box.insert_child_at_index(this._box, 1);
    }


    _createMenu() {
        const itemScreenshot =
            new PopupMenu.PopupImageMenuItem(
                _('Take Screenshot'),
                'screenshooter-symbolic'
            );

        itemScreenshot.connect('activate', () => {
            const laters = global.compositor.get_laters();

            laters.add(
                Meta.LaterType.BEFORE_REDRAW,
                () => {
                    Main.screenshotUI.open().catch(logError);
                    return GLib.SOURCE_REMOVE;
                }
            );

            this.menu.close();
        });


        const itemSettings =
            new PopupMenu.PopupImageMenuItem(
                _('Settings'),
                'org.gnome.Settings-symbolic'
            );

        itemSettings.connect('activate', () => {
            Shell.AppSystem.get_default()
                .lookup_app('org.gnome.Settings.desktop')
                .activate();
        });


        const itemPrivacy =
            new PopupMenu.PopupImageMenuItem(
                _('Privacy & Security'),
                'org.gnome.Settings-privacy-symbolic'
            );

        itemPrivacy.connect('activate', () => {
            Shell.AppSystem.get_default()
                .lookup_app('gnome-privacy-panel.desktop')
                .activate();
        });


        const itemOnline =
            new PopupMenu.PopupImageMenuItem(
                _('Online Accounts'),
                'org.gnome.Settings-online-accounts-symbolic'
            );

        itemOnline.connect('activate', () => {
            Shell.AppSystem.get_default()
                .lookup_app('gnome-online-accounts-panel.desktop')
                .activate();
        });


        const itemUsers =
            new PopupMenu.PopupMenuItem(
                _('User Settings')
            );

        itemUsers.connect('activate', () => {
            Shell.AppSystem.get_default()
                .lookup_app('gnome-users-panel.desktop')
                .activate();
        });


        //this.menu.addMenuItem(itemScreenshot);

        //this.menu.addMenuItem(itemSettings);
        /*this.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );*/

        this.menu.addMenuItem(itemPrivacy);
        this.menu.addMenuItem(itemOnline);

        this.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        this.menu.addMenuItem(itemUsers);

        this.menu.box.add_child(
            new St.Widget({
                style_class: 'space-item',
            })
        );
    }


    destroy() {
        if (this._notificationChangedId) {
            this._notificationSettings.disconnect(
                this._notificationChangedId
            );

            this._notificationChangedId = null;
        }

        if (this._notificationSettings) {
            this._notificationSettings = null;
        }

        super.destroy();
    }
});


export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._indicator = new ActivitiesMenuButton();

        Main.panel.addToStatusArea(
            this.uuid,
            this._indicator,
            5,
            'right'
        );
    }


    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
