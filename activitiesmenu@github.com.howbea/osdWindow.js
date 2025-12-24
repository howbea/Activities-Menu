import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Atk from 'gi://Atk';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Graphene from 'gi://Graphene';
import AccountsService from 'gi://AccountsService';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as BarLevel from 'resource:///org/gnome/shell/ui/barLevel.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

const N_QUICK_SETTINGS_COLUMNS = 2;
const INACTIVE_WORKSPACE_DOT_SCALE = 0.75;

const HIDE_TIMEOUT = 1500;
const FADE_TIME = 100;
const LEVEL_ANIMATION_TIME = 100;


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

export const OsdWindow = GObject.registerClass(
class OsdWindow extends Clutter.Actor {
    _init(monitorIndex) {
        super._init({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });

        this._monitorIndex = monitorIndex;
        let constraint = new Layout.MonitorConstraint({index: monitorIndex});
        this.add_constraint(constraint);

        this._hbox = new St.BoxLayout({
            style_class: 'osd-window',
            reactive: true
        });
        //this.add_child(this._hbox);

        this._icon = new St.Icon({y_expand: true});
        this._hbox.add_child(this._icon);

        this._vbox = new St.BoxLayout({
            //orientation: Clutter.Orientation.VERTICAL,
            //y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            reactive: true
        });
        
        this._vbox.add_child(new WorkspaceIndicators());        
        
        this.add_child(this._vbox); 

        this._hideTimeoutId = 0;
        this._reset();
        Main.uiGroup.add_child(this);
    }

    _updateBoxVisibility() {
        this._vbox.visible = [...this._vbox].some(c => c.visible);
    }

    setIcon(icon) {
        this._icon.gicon = icon;
    }

    setLabel(label) {
        this._label.visible = label != null;
        if (this._label.visible)
            this._label.text = label;
        this._updateBoxVisibility();
    }

    setLevel(value) {
        this._level.visible = value != null;
        if (this._level.visible) {
            if (this.visible) {
                this._level.ease_property('value', value, {
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    duration: LEVEL_ANIMATION_TIME,
                });
            } else {
                this._level.value = value;
            }
        }
        this._updateBoxVisibility();
    }

    setMaxLevel(maxLevel = 1) {
        this._level.maximum_value = maxLevel;
    }

    show() {
        if (!this._icon.gicon)
            return;

        if (!this.visible) {
            global.compositor.disable_unredirect();
            super.show();
            this.opacity = 0;
            this.get_parent().set_child_above_sibling(this, null);

            this.ease({
                opacity: 255,
                duration: FADE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        if (this._hideTimeoutId)
            GLib.source_remove(this._hideTimeoutId);
        this._hideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, HIDE_TIMEOUT, this._hide.bind(this));
        GLib.Source.set_name_by_id(this._hideTimeoutId, '[gnome-shell] this._hide');
    }
    
    showw() {

            global.compositor.disable_unredirect();
            super.show();
            this.opacity = 0;
            this.get_parent().set_child_above_sibling(this, null);

            this.ease({
                opacity: 255,
                duration: FADE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

        if (this._hideTimeoutId)
            GLib.source_remove(this._hideTimeoutId);
        this._hideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, HIDE_TIMEOUT, this._hide.bind(this));
        GLib.Source.set_name_by_id(this._hideTimeoutId, '[gnome-shell] this._hide');
    }

    cancel() {
        if (!this._hideTimeoutId)
            return;

        GLib.source_remove(this._hideTimeoutId);
        this._hide();
    }

    _hide() {
        this._hideTimeoutId = 0;
        this.ease({
            opacity: 0,
            duration: FADE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._reset();
                global.compositor.enable_unredirect();
            },
        });
        return GLib.SOURCE_REMOVE;
    }

    _reset() {
        super.hide();
        this.setLabel(null);
        this.setMaxLevel(null);
        this.setLevel(null);
    }
});

export class OsdWindowManager {
    constructor() {
        this._osdWindows = [];
        Main.layoutManager.connect('monitors-changed',
            this._monitorsChanged.bind(this));
        this._monitorsChanged();
    }

    _monitorsChanged() {
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            if (this._osdWindows[i] === undefined)
                this._osdWindows[i] = new OsdWindow(i);
        }

        for (let i = Main.layoutManager.monitors.length; i < this._osdWindows.length; i++) {
            this._osdWindows[i].destroy();
            this._osdWindows[i] = null;
        }

        this._osdWindows.length = Main.layoutManager.monitors.length;
    }

    _showOsdWindow(monitorIndex, icon, label, level, maxLevel) {
        this._osdWindows[monitorIndex].setIcon(icon);
        this._osdWindows[monitorIndex].setLabel(label);
        this._osdWindows[monitorIndex].setMaxLevel(maxLevel);
        this._osdWindows[monitorIndex].setLevel(level);
        this._osdWindows[monitorIndex].show();
    }
    
    _showOsdWindoww(monitorIndex) {
        this._osdWindows[monitorIndex].show();
    }

    show(icon, label, levels) {
        for (let i = 0; i < this._osdWindows.length; i++) {
            if (levels[i]) {
                const {level, maxLevel = -1} = levels[i];
                this._showOsdWindow(i, icon, label, level, maxLevel);
            } else {
                this._osdWindows[i].cancel();
            }
        }
    }    
    

    showOne(monitorIndex, icon, label, level, maxLevel) {
        this.show(icon, label, {
            [monitorIndex]: {level, maxLevel},
        });
    }

    showAll(icon, label, level, maxLevel) {
        for (let i = 0; i < this._osdWindows.length; i++)
            this._showOsdWindow(i, icon, label, level, maxLevel);
    }

    hideAll() {
        for (let i = 0; i < this._osdWindows.length; i++)
            this._osdWindows[i].cancel();
    }
}
