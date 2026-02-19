app_name = "support_center"
app_title = "Support Center"
app_publisher = "Justus Buyu"
app_description = "Support center for all apps"
app_email = "jb@zng.dk"
app_license = "mit"

# Apps
# ------------------

# Required Apps
required_apps = ["frappe", "erpnext"]

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "support_center",
		"logo": "/assets/support_center/images/support-dashboard-logo.svg",
		"title": "Support Center",
		"route": "/support-center",
		"has_permission": "support_center.api.permissions.has_app_permission"
	},
	{
		"name": "retention_dashboard",
		"logo": "/assets/support_center/images/retention-dashboard-logo.svg",
		"title": "Retention Dashboard",
		"route": "/retention-dashboard",
		"has_permission": "support_center.api.permissions.has_app_permission"
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/support_center/css/support_center.css"
# app_include_js = "/assets/support_center/js/support_center.js"

# include js, css files in header of web template
web_include_css = "/assets/support_center/css/support-dashboard.css"
# web_include_js = "/assets/support_center/js/support_center.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "support_center/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "support_center/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Website Route Rules
# -------------------

website_route_rules = [
    {"from_route": "/support-center", "to_route": "support-center"},
]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "support_center.utils.jinja_methods",
# 	"filters": "support_center.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "support_center.install.before_install"
# after_install = "support_center.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "support_center.uninstall.before_uninstall"
# after_uninstall = "support_center.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "support_center.utils.before_app_install"
# after_app_install = "support_center.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "support_center.utils.before_app_uninstall"
# after_app_uninstall = "support_center.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "support_center.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"support_center.tasks.all"
# 	],
# 	"daily": [
# 		"support_center.tasks.daily"
# 	],
# 	"hourly": [
# 		"support_center.tasks.hourly"
# 	],
# 	"weekly": [
# 		"support_center.tasks.weekly"
# 	],
# 	"monthly": [
# 		"support_center.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "support_center.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "support_center.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "support_center.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["support_center.utils.before_request"]
# after_request = ["support_center.utils.after_request"]

# Job Events
# ----------
# before_job = ["support_center.utils.before_job"]
# after_job = ["support_center.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"support_center.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

# Fixtures
# --------
fixtures = [
	{
		"doctype": "Page",
		"filters": [["name", "in", ["support-center"]]]
	}
]
