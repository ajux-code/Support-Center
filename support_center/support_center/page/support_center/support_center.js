/**
 * Support Dashboard - Desk Page Version
 *
 * This Desk page embeds the full www/support-dashboard page in an iframe
 * for seamless integration into the Frappe Desk sidebar.
 */

frappe.pages['support_center'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Support Dashboard',
        single_column: true
    });

    // Remove default padding for full-width iframe
    page.main.css({
        'padding': '0',
        'margin': '0'
    });

    // Create iframe container
    const iframe_container = $(`
        <div class="support-dashboard-iframe-container" style="
            width: 100%;
            height: calc(100vh - 120px);
            border: none;
            overflow: hidden;
        ">
            <iframe
                id="support-dashboard-iframe"
                src="/support-center"
                style="
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                "
                frameborder="0"
            ></iframe>
        </div>
    `);

    page.main.html(iframe_container);

    // Optional: Add refresh button in page header
    page.add_inner_button(__('Refresh'), function() {
        document.getElementById('support-dashboard-iframe').contentWindow.location.reload();
    }, 'fa fa-refresh');

    // Optional: Add "Open in New Tab" button
    page.add_inner_button(__('Open in New Tab'), function() {
        window.open('/support-center', '_blank');
    }, 'fa fa-external-link');

    // Handle iframe load events
    const iframe = document.getElementById('support-dashboard-iframe');

    iframe.addEventListener('load', function() {
        console.log('Support Dashboard loaded in Desk page');

        // Optional: Sync iframe height with content
        try {
            const iframeContent = iframe.contentWindow.document.body;
            iframe.style.height = iframeContent.scrollHeight + 'px';
        } catch (e) {
            // Cross-origin restrictions may prevent this
            console.log('Cannot access iframe content for height sync');
        }
    });

    // Handle communication from iframe (if needed)
    window.addEventListener('message', function(event) {
        // Handle messages from the embedded dashboard
        if (event.data && event.data.type === 'support-dashboard') {
            console.log('Message from Support Dashboard:', event.data);
        }
    });
};

// Cleanup when page is unloaded
frappe.pages['support_center'].on_page_show = function(wrapper) {
    // Refresh iframe on page show
    const iframe = document.getElementById('support-dashboard-iframe');
    if (iframe && iframe.src) {
        console.log('Support Dashboard page shown');
    }
};
