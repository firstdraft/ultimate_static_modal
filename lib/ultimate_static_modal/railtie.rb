# frozen_string_literal: true

require "rails/railtie"
require_relative "helpers/view_helper"

module UltimateStaticModal
  class Railtie < Rails::Railtie
    initializer "ultimate_static_modal.action_view" do
      ActiveSupport.on_load(:action_view) do
        include UltimateStaticModal::Helpers::ViewHelper
      end
    end
  end
end
