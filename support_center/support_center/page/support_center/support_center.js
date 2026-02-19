/**
 * Support Dashboard - Desk Page Version
 *
 * This Desk page embeds the full www/support-dashboard page in an iframe
 * for seamless integration into the Frappe Desk sidebar.
 */

frappe.pages['support-center'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Support Center',
        single_column: true
    });

    // Hide the page header since iframe has its own
    $(wrapper).find('.page-head').hide();

    // Remove all padding for full-width/height iframe
    page.main.css({ 'padding': '0', 'margin': '0' });
    $(wrapper).find('.layout-main-section').css('padding', '0');

    // Create iframe taking full viewport minus navbar
    const iframe_container = $(`
        <div style="width:100%; height:calc(100vh - 60px); overflow:hidden;">
            <iframe
                id="support-dashboard-iframe"
                src="/support-center"
                style="width:100%; height:100%; border:none; display:block;"
                frameborder="0"
            ></iframe>
        </div>
    `);

    page.main.html(iframe_container);
};

