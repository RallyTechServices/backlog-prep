Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addTree(this.down('#display_box'));
    },
    _addTree: function(container) {
        container.removeAll();
        this.setLoading("Loading...");
        
        var project = this.getContext().getProject();
        this.logger.log("Starting at Project ", project);
        container.add({
            xtype:'insideouttree',
            cls: 'rally-grid',
            columns: this._getColumns(),
            targetType: "Project",
            targetQuery: "( ObjectID = " + project.ObjectID + ")",
            
            listeners: {
                scope:this,
                afterrender:function(){
                    this.setLoading("Loading tree...");
                },
                afterloadtargets:function() {
                    this.setLoading('Finding relatives...');
                },
                afterload:function(tree_container){
                    this.setLoading('Building tree...');
                },
                aftertree:function(tree_container, tree){
                    this.logger.log("tree",tree);
                    var leaves = this._getLeavesFromTree(tree);
                    this.logger.log("leaves", leaves);
                    Ext.Array.each(leaves, function(leaf){
                        this._setCalculatedData(leaf);
                    },this);
                    this.setLoading(false);
                }
            }
        });
    },
    _getColumns: function() {
        var me = this;
        var name_renderer = function(value,meta_data,record) {
            return me._nameRenderer(value,meta_data,record);
        };
        
        var magic_renderer = function(field,value,meta_data,record){
            return me._magicRenderer(field,value,meta_data,record);
        }
        
        var columns = [
            {
                xtype: 'treecolumn',
                text: 'Item',
                dataIndex: 'Name',
                itemId: 'tree_column',
                renderer: name_renderer,
                width: 400,
                menuDisabled: true,
                otherFields: ['FormattedID','ObjectID']
            }, 
            {
                text: '# Backlog Stories',
                dataIndex: '__count_backlog',
                menuDisabled: true,
                leaves_only: true
            }
        ];
       
        return columns;
    },
    _nameRenderer: function(value,meta_data,record) {
        var display_value = record.get('Name');
        if ( record.get('FormattedID') ) {
            var link_text = record.get('FormattedID') + ": " + value;
            var url = Rally.nav.Manager.getDetailUrl( record );
            display_value = "<a target='_blank' href='" + url + "'>" + link_text + "</a>";
        }
        return display_value;
    },
    _getAvailableTreeHeight: function() {
        var body_height = this.getHeight() || Ext.getBody().getHeight();
        this.logger.log("Body height: ", body_height);
        var available_height = body_height - 100;
        this.logger.log("Returning height: ", available_height);
        return available_height;
    },
    _getLeavesFromTree:function(tree){
        var store = tree.getStore();
        var root = store.getRootNode();
        return this._getLeavesFromNode(root);
    },
    _getLeavesFromNode: function(node){
        var leaf_array = [];
        
        Ext.Array.each(node.childNodes,function(child_node){
            this.logger.log(child_node);
            if ( child_node.get('leaf') ) {
                leaf_array.push(child_node);
            } else {
                leaf_array = Ext.Array.merge(leaf_array, this._getLeavesFromNode(child_node));
            }
        },this);
        
        return leaf_array;
    },
    _setCalculatedData: function(project){
        Ext.create('Rally.data.wsapi.Store', {
            autoLoad: true,
            model: 'HierarchicalRequirement',
            context: {
                project: project.get('_ref')
            },
            fetch: ['ObjectID','AcceptedDate'],
            limit:'Infinity',
            listeners:  {
                scope: this,
                load: function(store, records, success){
                    var count_backlog = 0;
                    Ext.Array.each(records,function(record){
                        if ( !record.get('AcceptedDate') ) {
                            count_backlog++;
                        }
                    });
                    project.set('__count_backlog', count_backlog);
               }
           }
        });
    }
});