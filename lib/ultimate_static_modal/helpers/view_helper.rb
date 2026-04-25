# frozen_string_literal: true

module UltimateStaticModal
  module Helpers
    module ViewHelper
      def static_modal(**opts, &block)
        render(UltimateStaticModal.new(**opts), &block)
      end

      def static_drawer(position: nil, size: nil, **options, &block)
        cfg = UltimateTurboModal.configuration.drawer_config
        position = UltimateTurboModal::Base.validate_drawer_position!(position || cfg.position)
        size = UltimateTurboModal::Base.validate_drawer_size!(size || cfg.size)
        static_modal(drawer_position: position, size: size, **options, &block)
      end

      def static_modal_template(id, **opts, &block)
        content_tag(:template, id: id) { static_modal(**opts, &block) }
      end

      def static_drawer_template(id, **opts, &block)
        content_tag(:template, id: id) { static_drawer(**opts, &block) }
      end

      def static_modal_trigger(template_id, **button_opts, &block)
        data = button_opts.delete(:data) || {}
        data = data.merge(
          controller: [data[:controller], "static-modal"].compact.join(" "),
          static_modal_id_value: template_id,
          action: [data[:action], "click->static-modal#open"].compact.join(" ")
        )

        button_opts = {type: "button"}.merge(button_opts).merge(data: data)
        button_tag(button_opts, &block)
      end
    end
  end
end
