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
            treeScopeUp: false,
            listeners: {
                scope:this,
                afterrender:function(){
                    this.setLoading("Loading tree...");
                },
                afterloadtargets:function() {
                    this.setLoading('Finding projects...');
                },
                afterload:function(tree_container){
                    this.setLoading('Building tree...');
                },
                aftertree:function(tree_container, tree){
                    this.logger.log("tree",tree);
                    tree.expandAll();
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
                width: 250,
                menuDisabled: true,
                otherFields: ['FormattedID','ObjectID']
            },
            
                {
                    text: 'Backlog Stories (Count)',
                    dataIndex: '__backlog_by_count',
                    menuDisabled: true,
                    leaves_only: true
                },
                {
                    text: 'Backlog Stories (Size)',
                    dataIndex: '__backlog_by_size',
                    menuDisabled: true,
                    leaves_only: true
                },
            {
                text: 'Defaulted Stories',
                dataIndex: '__count_defaulted',
                menuDisabled: true,
                leaves_only: true
            },
            {
                text: 'Velocity by Count',
                dataIndex: '__velocity_by_count',
                menuDisabled: true,
                leaves_only: true
            },
            {
                text: 'Velocity by Size',
                dataIndex: '__velocity_by_size',
                menuDisabled: true,
                leaves_only: true
            },
            {
                text:'Sprints by Count',
                dataIndex: '__sprints_by_count',
                menuDisabled: true,
                leaves_only: true,
                renderer: function(value,meta_data,record){
                    if ( value == "--") {
                        meta_data.style = "background-color: #FFFACD";
                    }
                    if ( value > 2 ) {
                        meta_data.style = "background-color: #FA8072";
                    }
                    return value;
                }
            },
            {
                text:'Sprints by Size',
                dataIndex: '__sprints_by_size',
                menuDisabled: true,
                leaves_only: true,
                renderer: function(value,meta_data,record){
                    if ( value == "--") {
                        meta_data.style = "background-color: #FFFACD";
                    }
                    if ( value > 2 ) {
                        meta_data.style = "background-color: #FA8072";
                    }
                    return value;
                }
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
            filters: [{ property: 'DirectChildrenCount', value: 0 }],
            fetch: ['ObjectID','AcceptedDate','PlanEstimate','ScheduleState','Iteration'],
            limit:'Infinity',
            listeners:  {
                scope: this,
                load: function(store, records, success){
                    var backlog_by_count = 0;
                    var count_defaulted = 0;
                    var backlog_by_size = 0;
                    
                    Ext.Array.each(records,function(record){
                        if ( !record.get('AcceptedDate') && record.get('ScheduleState') != 'Completed') {
                            var size = record.get('PlanEstimate') || 0;
                            if ( size == 0 ) {
                                size = 8;
                                count_defaulted++;
                            }
                            backlog_by_count++;
                            backlog_by_size += size;
                        }
                    });
                    project.set('__backlog_by_count', backlog_by_count);
                    project.set('__backlog_by_size', backlog_by_size);
                    project.set('__count_defaulted', count_defaulted);
                    
                    this._setVelocity(project,records).then({
                        scope: this,
                        success: function(results){
                            var sprints_by_count = '--';
                            var sprints_by_size  = '--';
                            
                            if ( project.get('__velocity_by_count') > 0 ) {
                                sprints_by_count = project.get('__backlog_by_count') / project.get('__velocity_by_count');
                            }
                            
                            if ( project.get('__velocity_by_size') > 0 ) {
                                sprints_by_size = project.get('__backlog_by_size') / project.get('__velocity_by_size');
                            }
                            
                            
                            project.set('__sprints_by_count',sprints_by_count);
                            project.set('__sprints_by_size', sprints_by_size );
                        },
                        failure: function(message){
                            this.logger.log("Error getting velocities: ", message);
                        }
                    });
               }
           }
        });
    },
    _setVelocity: function(project,stories){
        var deferred = Ext.create('Deft.Deferred');
        var today = Rally.util.DateTime.toIsoString(new Date());
        
        // get the last three completed iterations
        Ext.create('Rally.data.wsapi.Store', {
            autoLoad: true,
            model: 'Iteration',
            filters: [{ property:'EndDate', operator: '<', value: today}],
            sorters: [
                {
                    property: 'EndDate',
                    direction: 'DESC'
                }
            ],
            context: {
                project: project.get('_ref')
            },
            fetch: ['ObjectID'],
            limit:3,
            pageSize: 3,
            listeners:  {
                scope: this,
                load: function(store, records, success){
                    this.logger.log(records);
                    var number_of_iterations = records.length;
                    var velocity_by_count = 0;
                    var velocity_by_size = 0;
                    if ( number_of_iterations > 0 ) {
                        var iteration_oids = [];
                        Ext.Array.each(records,function(record){ iteration_oids.push(record.get('ObjectID'))});
                        // calculate velocity
                        var accepted_count = 0;
                        var accepted_points = 0;
                        Ext.Array.each(stories, function(story){
                            if ( story.get('AcceptedDate') && story.get('Iteration')) {
                                if ( Ext.Array.contains( iteration_oids, story.get('Iteration').ObjectID ) ) {
                                    velocity_by_count++;
                                    var size = story.get('PlanEstimate') || 0;
                                    velocity_by_size += size;
                                }
                            }
                        });
                        velocity_by_count = velocity_by_count / number_of_iterations;
                        velocity_by_size = velocity_by_size / number_of_iterations;
                    }
                    
                    project.set('__velocity_by_count',velocity_by_count);
                    project.set('__velocity_by_size',velocity_by_size);
                    
                    deferred.resolve(records);
                }
                
           }
        });
        
        return deferred;
    }
});